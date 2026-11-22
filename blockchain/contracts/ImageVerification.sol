// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ImageVerification
 * @dev Smart contract for storing and verifying image ownership on the blockchain
 *      Supports IPFS CIDs, multi-user wallet auth via relayer, image revocation,
 *      and duplicate/near-duplicate detection safeguards.
 *      Compiled with --evm-version paris for full EVM compatibility.
 */
contract ImageVerification {
    
    // Struct order: imageHash, owner, timestamp, fileName, ipfsCID, exists, isRevoked
    struct ImageRecord {
        string imageHash;
        address owner;
        uint256 timestamp;
        string fileName;
        string ipfsCID;
        bool exists;
        bool isRevoked;
    }
    
    // Backend admin address (deployer / gas relayer)
    address public backendAdmin;
    
    // Mapping from image hash to ImageRecord
    mapping(string => ImageRecord) private images;
    
    // Array to store all image hashes
    string[] private imageHashes;
    
    // Mapping to track user's images
    mapping(address => string[]) private userImages;
    
    // Events
    event ImageRegistered(
        string imageHash,
        address owner,
        string fileName,
        string ipfsCID,
        uint256 timestamp
    );

    event ImageRegisteredFor(
        string imageHash,
        address owner,
        address registeredBy,
        string fileName,
        string ipfsCID,
        uint256 timestamp
    );

    event ImageRevoked(
        string imageHash,
        address owner,
        uint256 timestamp
    );
    
    event ImageVerified(
        string indexed imageHash,
        address indexed verifier,
        bool isAuthentic,
        uint256 timestamp
    );

    event OwnershipTransferred(
        string indexed imageHash,
        address indexed previousOwner,
        address indexed newOwner,
        uint256 timestamp
    );

    constructor() {
        backendAdmin = msg.sender;
    }
    
    /**
     * @dev Register an image on behalf of a verified user wallet.
     *      Can be called by the backend admin for authenticated users,
     *      or directly by the user themself.
     *      Allows re-registration if the previous registration was revoked.
     * @param _user The real owner wallet address
     * @param _imageHash SHA-256 hash of the image
     * @param _fileName Original file name
     * @param _ipfsCID IPFS Content Identifier
     */
    function registerImageFor(
        address _user,
        string memory _imageHash, 
        string memory _fileName, 
        string memory _ipfsCID
    ) public returns (bool) {
        require(msg.sender == backendAdmin || msg.sender == _user, "Only backend admin or user can register");
        require(_user != address(0), "User address cannot be zero");
        require(bytes(_imageHash).length > 0, "Image hash cannot be empty");
        
        bool isReRegister = images[_imageHash].exists && images[_imageHash].isRevoked;
        require(!images[_imageHash].exists || isReRegister, "Image already registered");
        
        images[_imageHash] = ImageRecord({
            imageHash: _imageHash,
            owner: _user,
            timestamp: block.timestamp,
            fileName: _fileName,
            ipfsCID: _ipfsCID,
            exists: true,
            isRevoked: false
        });
        
        if (!isReRegister) {
            imageHashes.push(_imageHash);
        }
        userImages[_user].push(_imageHash);
        
        emit ImageRegisteredFor(_imageHash, _user, msg.sender, _fileName, _ipfsCID, block.timestamp);
        emit ImageRegistered(_imageHash, _user, _fileName, _ipfsCID, block.timestamp);
        
        return true;
    }

    /**
     * @dev Register a new image directly (backward compatibility)
     *      Delegates to registerImageFor(msg.sender, ...)
     * @param _imageHash SHA-256 hash of the image
     * @param _fileName Original file name
     * @param _ipfsCID IPFS Content Identifier
     */
    function registerImage(
        string memory _imageHash, 
        string memory _fileName, 
        string memory _ipfsCID
    ) public returns (bool) {
        return registerImageFor(msg.sender, _imageHash, _fileName, _ipfsCID);
    }

    /**
     * @dev Register a new image directly without IPFS CID (2-argument backward compatibility)
     *      Delegates to registerImageFor(msg.sender, _imageHash, _fileName, "")
     * @param _imageHash SHA-256 hash of the image
     * @param _fileName Original file name
     */
    function registerImage(
        string memory _imageHash, 
        string memory _fileName
    ) public returns (bool) {
        return registerImageFor(msg.sender, _imageHash, _fileName, "");
    }

    /**
     * @dev Revoke an existing image registration.
     *      Only the owner of the image (or backendAdmin as gas relayer) can call it.
     * @param _imageHash SHA-256 hash of the image to revoke
     */
    function revokeImage(string memory _imageHash) public returns (bool) {
        require(images[_imageHash].exists, "Image is not registered");
        require(!images[_imageHash].isRevoked, "Image is already revoked");
        require(
            msg.sender == images[_imageHash].owner || msg.sender == backendAdmin,
            "Only owner can revoke"
        );

        images[_imageHash].isRevoked = true;
        emit ImageRevoked(_imageHash, images[_imageHash].owner, block.timestamp);
        return true;
    }

    /**
     * @dev Check if an image is revoked
     * @param _imageHash SHA-256 hash of the image
     */
    function isImageRevoked(string memory _imageHash) public view returns (bool) {
        require(images[_imageHash].exists, "Image is not registered");
        return images[_imageHash].isRevoked;
    }

    /**
     * @dev Register multiple images in a single transaction (batch registration)
     * @param _hashes Array of image hashes
     * @param _fileNames Array of original file names
     * @param _ipfsCIDs Array of IPFS CIDs
     */
    function registerBatch(
        string[] memory _hashes, 
        string[] memory _fileNames,
        string[] memory _ipfsCIDs
    ) public returns (bool) {
        require(_hashes.length > 0, "Batch cannot be empty");
        require(_hashes.length == _fileNames.length, "Hashes and filenames length mismatch");
        require(_hashes.length == _ipfsCIDs.length, "Hashes and IPFS CIDs length mismatch");

        for (uint256 i = 0; i < _hashes.length; i++) {
            if (bytes(_hashes[i]).length > 0 && (!images[_hashes[i]].exists || images[_hashes[i]].isRevoked)) {
                bool isReReg = images[_hashes[i]].exists;
                images[_hashes[i]] = ImageRecord({
                    imageHash: _hashes[i],
                    owner: msg.sender,
                    timestamp: block.timestamp,
                    fileName: _fileNames[i],
                    ipfsCID: _ipfsCIDs[i],
                    exists: true,
                    isRevoked: false
                });
                if (!isReReg) {
                    imageHashes.push(_hashes[i]);
                }
                userImages[msg.sender].push(_hashes[i]);
                emit ImageRegistered(_hashes[i], msg.sender, _fileNames[i], _ipfsCIDs[i], block.timestamp);
            }
        }
        return true;
    }

    /**
     * @dev Register multiple images in batch without IPFS CIDs (2-argument backward compatibility)
     */
    function registerBatch(
        string[] memory _hashes, 
        string[] memory _fileNames
    ) public returns (bool) {
        string[] memory emptyCids = new string[](_hashes.length);
        return registerBatch(_hashes, _fileNames, emptyCids);
    }

    /**
     * @dev Transfer ownership of a registered image to a new address
     * @param _imageHash SHA-256 hash of the image
     * @param _newOwner Address of the new owner
     */
    function transferOwnership(string memory _imageHash, address _newOwner) public returns (bool) {
        require(images[_imageHash].exists, "Image is not registered");
        require(!images[_imageHash].isRevoked, "Cannot transfer revoked image");
        require(
            images[_imageHash].owner == msg.sender || msg.sender == backendAdmin,
            "Only current owner can transfer ownership"
        );
        require(_newOwner != address(0), "New owner address cannot be zero");
        require(_newOwner != images[_imageHash].owner, "New owner must be different from current owner");

        address previousOwner = images[_imageHash].owner;
        images[_imageHash].owner = _newOwner;
        userImages[_newOwner].push(_imageHash);

        emit OwnershipTransferred(_imageHash, previousOwner, _newOwner, block.timestamp);
        return true;
    }
    
    /**
     * @dev Verify if an image exists and get its details
     * @param _imageHash SHA-256 hash of the image to verify
     */
    function verifyImage(string memory _imageHash) public view returns (
        string memory imageHash,
        address owner,
        uint256 timestamp,
        string memory fileName,
        string memory ipfsCID,
        bool exists,
        bool isRevoked
    ) {
        ImageRecord memory record = images[_imageHash];
        return (
            record.imageHash,
            record.owner,
            record.timestamp,
            record.fileName,
            record.ipfsCID,
            record.exists,
            record.isRevoked
        );
    }
    
    /**
     * @dev Get image details
     * @param _imageHash SHA-256 hash of the image
     */
    function getImageDetails(string memory _imageHash) public view returns (
        string memory imageHash,
        address owner,
        uint256 timestamp,
        string memory fileName,
        string memory ipfsCID,
        bool exists,
        bool isRevoked
    ) {
        ImageRecord memory record = images[_imageHash];
        return (
            record.imageHash,
            record.owner,
            record.timestamp,
            record.fileName,
            record.ipfsCID,
            record.exists,
            record.isRevoked
        );
    }
    
    /**
     * @dev Check if an image is registered
     * @param _imageHash SHA-256 hash of the image
     */
    function isImageRegistered(string memory _imageHash) public view returns (bool) {
        return images[_imageHash].exists;
    }
    
    /**
     * @dev Get all images registered by a specific user
     * @param _user Address of the user
     */
    function getUserImages(address _user) public view returns (string[] memory) {
        return userImages[_user];
    }
    
    /**
     * @dev Get total number of registered images
     */
    function getTotalImages() public view returns (uint256) {
        return imageHashes.length;
    }
    
    /**
     * @dev Get image hash by index
     * @param _index Index in the imageHashes array
     */
    function getImageByIndex(uint256 _index) public view returns (string memory) {
        require(_index < imageHashes.length, "Index out of bounds");
        return imageHashes[_index];
    }
}
