// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ImageVerification
 * @dev Smart contract for storing and verifying image ownership on the blockchain
 *      Supports individual and batch registration, ownership transfer, and view queries.
 */
contract ImageVerification {
    
    struct ImageRecord {
        string imageHash;
        address owner;
        uint256 timestamp;
        string fileName;
        bool exists;
    }
    
    // Mapping from image hash to ImageRecord
    mapping(string => ImageRecord) private images;
    
    // Array to store all image hashes
    string[] private imageHashes;
    
    // Mapping to track user's images
    mapping(address => string[]) private userImages;
    
    // Events
    event ImageRegistered(
        string indexed imageHash,
        address indexed owner,
        uint256 timestamp,
        string fileName
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
    
    /**
     * @dev Register a new image on the blockchain
     * @param _imageHash SHA-256 hash of the image
     * @param _fileName Original file name
     */
    function registerImage(string memory _imageHash, string memory _fileName) public returns (bool) {
        require(bytes(_imageHash).length > 0, "Image hash cannot be empty");
        require(!images[_imageHash].exists, "Image already registered");
        
        images[_imageHash] = ImageRecord({
            imageHash: _imageHash,
            owner: msg.sender,
            timestamp: block.timestamp,
            fileName: _fileName,
            exists: true
        });
        
        imageHashes.push(_imageHash);
        userImages[msg.sender].push(_imageHash);
        
        emit ImageRegistered(_imageHash, msg.sender, block.timestamp, _fileName);
        
        return true;
    }

    /**
     * @dev Register multiple images in a single transaction (batch registration)
     * @param _hashes Array of image hashes
     * @param _fileNames Array of original file names
     */
    function registerBatch(string[] memory _hashes, string[] memory _fileNames) public returns (bool) {
        require(_hashes.length > 0, "Batch cannot be empty");
        require(_hashes.length == _fileNames.length, "Hashes and filenames length mismatch");

        for (uint256 i = 0; i < _hashes.length; i++) {
            if (bytes(_hashes[i]).length > 0 && !images[_hashes[i]].exists) {
                images[_hashes[i]] = ImageRecord({
                    imageHash: _hashes[i],
                    owner: msg.sender,
                    timestamp: block.timestamp,
                    fileName: _fileNames[i],
                    exists: true
                });
                imageHashes.push(_hashes[i]);
                userImages[msg.sender].push(_hashes[i]);
                emit ImageRegistered(_hashes[i], msg.sender, block.timestamp, _fileNames[i]);
            }
        }
        return true;
    }

    /**
     * @dev Transfer ownership of a registered image to a new address
     * @param _imageHash SHA-256 hash of the image
     * @param _newOwner Address of the new owner
     */
    function transferOwnership(string memory _imageHash, address _newOwner) public returns (bool) {
        require(images[_imageHash].exists, "Image is not registered");
        require(images[_imageHash].owner == msg.sender, "Only current owner can transfer ownership");
        require(_newOwner != address(0), "New owner address cannot be zero");
        require(_newOwner != msg.sender, "New owner must be different from current owner");

        address previousOwner = images[_imageHash].owner;
        images[_imageHash].owner = _newOwner;
        userImages[_newOwner].push(_imageHash);

        emit OwnershipTransferred(_imageHash, previousOwner, _newOwner, block.timestamp);
        return true;
    }
    
    /**
     * @dev Verify if an image exists and get its details (view function with ONE field order)
     * @param _imageHash SHA-256 hash of the image to verify
     */
    function verifyImage(string memory _imageHash) public view returns (
        string memory imageHash,
        address owner,
        uint256 timestamp,
        string memory fileName,
        bool exists
    ) {
        ImageRecord memory record = images[_imageHash];
        return (record.imageHash, record.owner, record.timestamp, record.fileName, record.exists);
    }
    
    /**
     * @dev Get image details (view function with ONE field order everywhere)
     * @param _imageHash SHA-256 hash of the image
     */
    function getImageDetails(string memory _imageHash) public view returns (
        string memory imageHash,
        address owner,
        uint256 timestamp,
        string memory fileName,
        bool exists
    ) {
        ImageRecord memory record = images[_imageHash];
        return (record.imageHash, record.owner, record.timestamp, record.fileName, record.exists);
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
