'use strict';

const stringify = require('json-stringify-deterministic');
const sortKeysRecursive = require('sort-keys-recursive');
const { Contract } = require('fabric-contract-api');

const ORG1_MSP = 'Org1MSP';
const ORG2_MSP = 'Org2MSP';

class EvidenceContract extends Contract {
    async RegisterEvidence(ctx, evidenceJSON) {
        const evidence = this.parseJSON(evidenceJSON, 'evidence');
        this.validateEvidence(evidence);

        if (ctx.clientIdentity.getMSPID() !== ORG1_MSP) {
            throw new Error('Only Org1MSP may register evidence');
        }

        const existing = await ctx.stub.getState(evidence.evidence_id);
        if (existing && existing.length > 0) {
            throw new Error(`Evidence ${evidence.evidence_id} already exists`);
        }

        await ctx.stub.putState(
            evidence.evidence_id,
            Buffer.from(stringify(sortKeysRecursive(evidence)))
        );

        const registeredEvent = {
            event_id: `${evidence.evidence_id}_REGISTERED`,
            evidence_id: evidence.evidence_id,
            user_id: evidence.created_by,
            event_type: 'REGISTERED',
            timestamp: this.timestamp(ctx),
            remarks: 'Evidence registered',
            msp_id: ORG1_MSP,
        };
        await this.putCustodyEvent(ctx, registeredEvent);

        return evidence;
    }

    async RecordCustodyEvent(ctx, eventJSON) {
        const event = this.parseJSON(eventJSON, 'custody event');
        this.validateCustodyEvent(event);

        const evidenceState = await ctx.stub.getState(event.evidence_id);
        if (!evidenceState || evidenceState.length === 0) {
            throw new Error(`Evidence ${event.evidence_id} does not exist`);
        }

        const mspId = ctx.clientIdentity.getMSPID();
        const latestEvent = await this.latestCustodyEvent(ctx, event.evidence_id);
        this.validateCustodyTransition(event.event_type, mspId, latestEvent.event_type);

        event.timestamp = this.timestamp(ctx);
        event.msp_id = mspId;
        await this.putCustodyEvent(ctx, event);
        return event;
    }

    async GetVerificationData(ctx, evidenceID) {
        const evidence = await this.getEvidenceObject(ctx, evidenceID);
        return Object.fromEntries(evidence.segments.map((segment) => [
            segment.segment_id,
            segment.sha256_hash,
        ]));
    }

    async GetEvidence(ctx, evidenceID) {
        return this.getEvidenceObject(ctx, evidenceID);
    }

    async GetCustodyHistory(ctx, evidenceID) {
        await this.getEvidenceObject(ctx, evidenceID);
        const iterator = await ctx.stub.getStateByPartialCompositeKey(
            'CustodyEvent',
            [evidenceID]
        );
        const events = [];
        let result = await iterator.next();
        while (!result.done) {
            events.push(JSON.parse(result.value.value.toString('utf8')));
            result = await iterator.next();
        }
        await iterator.close();
        return events.sort((left, right) => {
            const timestampOrder = left.timestamp.localeCompare(right.timestamp);
            return timestampOrder || left.event_id.localeCompare(right.event_id);
        });
    }

    parseJSON(value, name) {
        try {
            return JSON.parse(value);
        } catch (error) {
            throw new Error(`Invalid ${name} JSON: ${error.message}`);
        }
    }

    validateEvidence(evidence) {
        if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
            throw new Error('Evidence must be a JSON object');
        }
        if (typeof evidence.evidence_id !== 'string' || evidence.evidence_id.trim() === '') {
            throw new Error('evidence_id must not be empty');
        }
        if (!Array.isArray(evidence.segments)) {
            throw new Error('segments must be an array');
        }
        if (evidence.segment_count !== evidence.segments.length) {
            throw new Error('segment_count must equal segments.length');
        }
        for (const segment of evidence.segments) {
            if (!segment || typeof segment !== 'object' ||
                typeof segment.sha256_hash !== 'string' ||
                !/^[0-9a-fA-F]{64}$/.test(segment.sha256_hash)) {
                throw new Error('Each segment sha256_hash must be exactly 64 hexadecimal characters');
            }
        }
    }

    validateCustodyEvent(event) {
        if (!event || typeof event !== 'object' || Array.isArray(event)) {
            throw new Error('Custody event must be a JSON object');
        }
        for (const field of ['event_id', 'evidence_id', 'user_id', 'event_type']) {
            if (typeof event[field] !== 'string' || event[field].trim() === '') {
                throw new Error(`${field} must not be empty`);
            }
        }
        if (!['TRANSFERRED_TO_LAB', 'RECEIVED_BY_FORENSICS',
            'VERIFICATION_VERIFIED', 'VERIFICATION_TAMPER_DETECTED'].includes(event.event_type)) {
            throw new Error(`Unsupported custody event type ${event.event_type}`);
        }
    }

    validateCustodyTransition(eventType, mspId, latestType) {
        const transitions = {
            TRANSFERRED_TO_LAB: { msp: ORG1_MSP, previous: 'REGISTERED' },
            RECEIVED_BY_FORENSICS: { msp: ORG2_MSP, previous: 'TRANSFERRED_TO_LAB' },
            VERIFICATION_VERIFIED: { msp: ORG2_MSP, previous: 'RECEIVED_BY_FORENSICS' },
            VERIFICATION_TAMPER_DETECTED: { msp: ORG2_MSP, previous: 'RECEIVED_BY_FORENSICS' },
        };
        const transition = transitions[eventType];
        if (mspId !== transition.msp) {
            throw new Error(`${eventType} may only be recorded by ${transition.msp}`);
        }
        if (latestType !== transition.previous) {
            throw new Error(`${eventType} requires the latest custody event to be ${transition.previous}; it is ${latestType}`);
        }
    }

    async putCustodyEvent(ctx, event) {
        const key = ctx.stub.createCompositeKey('CustodyEvent', [
            event.evidence_id,
            event.event_id,
        ]);
        const existing = await ctx.stub.getState(key);
        if (existing && existing.length > 0) {
            throw new Error(`Custody event ${event.event_id} already exists`);
        }
        await ctx.stub.putState(key, Buffer.from(stringify(sortKeysRecursive(event))));
    }

    async latestCustodyEvent(ctx, evidenceID) {
        const events = await this.GetCustodyHistory(ctx, evidenceID);
        if (events.length === 0) {
            throw new Error(`No custody history exists for evidence ${evidenceID}`);
        }
        return events[events.length - 1];
    }

    async getEvidenceObject(ctx, evidenceID) {
        if (typeof evidenceID !== 'string' || evidenceID.trim() === '') {
            throw new Error('evidenceID must not be empty');
        }
        const state = await ctx.stub.getState(evidenceID);
        if (!state || state.length === 0) {
            throw new Error(`Evidence ${evidenceID} does not exist`);
        }
        return JSON.parse(state.toString('utf8'));
    }

    timestamp(ctx) {
        const txTimestamp = ctx.stub.getTxTimestamp();
        const seconds = Number(txTimestamp.seconds);
        const milliseconds = seconds * 1000 + Math.floor(txTimestamp.nanos / 1000000);
        return new Date(milliseconds).toISOString();
    }
}

module.exports = EvidenceContract;