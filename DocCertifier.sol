// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title DocCertifier — certifies document hashes on Ethereum
/// @notice Stores keccak256 hashes of documents with issuer address and timestamp
contract DocCertifier {

    struct Certificate {
        address issuer;      // who certified this document
        uint256 timestamp;   // block.timestamp at certification
        string  metadata;    // e.g. "Diplôme L3 Info – Alice Martin – 2025"
        bool    revoked;     // issuer can revoke a mistaken certification
    }

    // docHash => Certificate
    mapping(bytes32 => Certificate) private certificates;

    // Events — indexed by hash and issuer for efficient log filtering
    event DocumentCertified(
        bytes32 indexed docHash,
        address indexed issuer,
        uint256 timestamp,
        string  metadata
    );
    event DocumentRevoked(bytes32 indexed docHash, address indexed issuer);

    // ─── Write functions ──────────────────────────────────────────────────

    /// @notice Certify a document hash. Reverts if already certified.
    /// @param docHash  keccak256 hash of the document bytes
    /// @param metadata Human-readable description (name, title, date)
    function certify(bytes32 docHash, string calldata metadata) external {
        require(certificates[docHash].timestamp == 0, "Already certified");
        require(bytes(metadata).length > 0, "Metadata cannot be empty");

        certificates[docHash] = Certificate({
            issuer:    msg.sender,
            timestamp: block.timestamp,
            metadata:  metadata,
            revoked:   false
        });

        emit DocumentCertified(docHash, msg.sender, block.timestamp, metadata);
    }

    /// @notice Revoke a certificate. Only the original issuer can revoke.
    function revoke(bytes32 docHash) external {
        Certificate storage cert = certificates[docHash];
        require(cert.timestamp != 0, "Not certified");
        require(cert.issuer == msg.sender, "Not the issuer");
        require(!cert.revoked, "Already revoked");

        cert.revoked = true;
        emit DocumentRevoked(docHash, msg.sender);
    }

    // ─── Read functions (free — no gas) ──────────────────────────────────

    /// @notice Verify a document. Returns all certificate data.
    function verify(bytes32 docHash)
        external
        view
        returns (
            address issuer,
            uint256 timestamp,
            string memory metadata,
            bool    revoked
        )
    {
        Certificate memory cert = certificates[docHash];
        require(cert.timestamp != 0, "Document not certified");
        return (cert.issuer, cert.timestamp, cert.metadata, cert.revoked);
    }

    /// @notice Quick existence check — returns true if certified and not revoked
    function isValid(bytes32 docHash) external view returns (bool) {
        Certificate memory cert = certificates[docHash];
        return cert.timestamp != 0 && !cert.revoked;
    }
}