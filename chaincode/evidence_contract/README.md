# Evidence Contract

JavaScript chaincode for registering evidence and recording its custody history.

## Deploy

From `fabric-samples/test-network`:

```sh
./network.sh deployCC -c evidence-channel -ccn evidence -ccp ../../chaincode/evidence_contract -ccl javascript -ccep "AND('Org1MSP.peer','Org2MSP.peer')"
```

## CLI setup

From `fabric-samples/test-network`:

```sh
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/
export CORE_PEER_TLS_ENABLED=true
export ORDERER_CA=${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem
export ORG1_TLS=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export ORG2_TLS=${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
```

Org1 identity:

```sh
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_TLS_ROOTCERT_FILE=$ORG1_TLS
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
```

Org2 identity:

```sh
export CORE_PEER_LOCALMSPID=Org2MSP
export CORE_PEER_TLS_ROOTCERT_FILE=$ORG2_TLS
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
export CORE_PEER_ADDRESS=localhost:9051
```

## Test commands

Channel info before and after the tests:

```sh
peer channel getinfo -c evidence-channel
```

Successful invocations used the following pattern, with the shown function arguments:

```sh
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA -C evidence-channel -n evidence --peerAddresses localhost:7051 --tlsRootCertFiles $ORG1_TLS --peerAddresses localhost:9051 --tlsRootCertFiles $ORG2_TLS -c '{"function":"RegisterEvidence","Args":["{\"evidence_id\":\"EVD001\",\"recording_id\":\"REC-2026-001\",\"source_type\":\"body-worn-camera\",\"start_time\":\"2026-09-24T10:00:00Z\",\"end_time\":\"2026-09-24T10:03:00Z\",\"duration\":180,\"segment_count\":3,\"created_by\":\"police-admin\",\"created_at\":\"2026-09-24T10:04:00Z\",\"segments\":[{\"segment_id\":\"EVD001_S001\",\"segment_number\":1,\"start_time\":\"2026-09-24T10:00:00Z\",\"end_time\":\"2026-09-24T10:01:00Z\",\"sha256_hash\":\"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08\"},{\"segment_id\":\"EVD001_S002\",\"segment_number\":2,\"start_time\":\"2026-09-24T10:01:00Z\",\"end_time\":\"2026-09-24T10:02:00Z\",\"sha256_hash\":\"60303ae22b9988610fbadf57c1e0a0a1f7d3c9b4e2a6f8d0c1b2a3948576e1f2\"},{\"segment_id\":\"EVD001_S003\",\"segment_number\":3,\"start_time\":\"2026-09-24T10:02:00Z\",\"end_time\":\"2026-09-24T10:03:00Z\",\"sha256_hash\":\"a5c1e9d4f8b2a7c3d6e0f1a2b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0\"}]} "]}' --waitForEvent
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA -C evidence-channel -n evidence --peerAddresses localhost:7051 --tlsRootCertFiles $ORG1_TLS --peerAddresses localhost:9051 --tlsRootCertFiles $ORG2_TLS -c '{"function":"RecordCustodyEvent","Args":["{\"event_id\":\"EVD001_TRANSFER_001\",\"evidence_id\":\"EVD001\",\"user_id\":\"officer-1001\",\"event_type\":\"TRANSFERRED_TO_LAB\",\"remarks\":\"Transferred to forensic laboratory\"}"]}' --waitForEvent
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA -C evidence-channel -n evidence --peerAddresses localhost:7051 --tlsRootCertFiles $ORG1_TLS --peerAddresses localhost:9051 --tlsRootCertFiles $ORG2_TLS -c '{"function":"RecordCustodyEvent","Args":["{\"event_id\":\"EVD001_RECEIVED_001\",\"evidence_id\":\"EVD001\",\"user_id\":\"forensic-2001\",\"event_type\":\"RECEIVED_BY_FORENSICS\",\"remarks\":\"Received for forensic examination\"}"]}' --waitForEvent
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA -C evidence-channel -n evidence --peerAddresses localhost:7051 --tlsRootCertFiles $ORG1_TLS --peerAddresses localhost:9051 --tlsRootCertFiles $ORG2_TLS -c '{"function":"RecordCustodyEvent","Args":["{\"event_id\":\"EVD001_TAMPER_001\",\"evidence_id\":\"EVD001\",\"user_id\":\"forensic-2001\",\"event_type\":\"VERIFICATION_TAMPER_DETECTED\",\"remarks\":\"Mismatch in segment EVD001_S002\"}"]}' --waitForEvent
peer chaincode query -C evidence-channel -n evidence -c '{"function":"GetVerificationData","Args":["EVD001"]}'
peer chaincode query -C evidence-channel -n evidence -c '{"function":"GetCustodyHistory","Args":["EVD001"]}'
peer chaincode query -C evidence-channel -n evidence -c '{"function":"GetEvidence","Args":["EVD001"]}'
```

The negative tests used the same invoke command, with these function arguments and identities:

```text
Org2MSP RegisterEvidence(EVD002) -> Only Org1MSP may register evidence
Org1MSP RegisterEvidence(EVD001) -> Evidence EVD001 already exists
Org2MSP RecordCustodyEvent(EVD002, VERIFICATION_TAMPER_DETECTED) -> latest custody event must be RECEIVED_BY_FORENSICS; it is REGISTERED
```

Successful transaction IDs from the test run:

```text
EVD001 registration: 988f4ec4fb0b6a9cf0707399fa9e3c5be7f76076d1ef412a36bacb4c4bfa39ac
EVD001 transfer:     8df37679d3872138bc8110e6d6717878e7098df1ed0f438c5bed904f3ca3b4a8
EVD001 receipt:      87701120b0e6a1f628ed87b80b18b05595d27d85789691fffae9487cd9c98279
EVD001 tamper:       a3ebfc5dd3627db8ca0df422a85d120aa946e9b12596c3027b8a9d4fba0a172f
EVD002 setup:        b954d146dd729ba32f955fc96335b23bdc43c6ee5c5e2ad1b5c5f8a48646a61c
```