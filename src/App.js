import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';

// --- CONFIGURATION: UPDATE THESE THREE VARIABLES ---
const PINATA_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0YjVhYWFjNy0zOWI2LTRiZjYtYmQ5NC05NWVkODE4YzFjMTIiLCJlbWFpbCI6IjIzejMxMkBwc2d0ZWNoLmFjLmluIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6IjJlMGI1MjA2NDdjNzQ3YzQ1YzhlIiwic2NvcGVkS2V5U2VjcmV0IjoiNGFhMWUyNjZiMDk3MDcyMGM2Yjk0NjdjMzYwMTY1MjkyZDYwMTk4ZGE2ZWI4MTI2MmM0MTU2MGU5NmVhYzRhYSIsImV4cCI6MTgwMzM5OTEyOX0.uFeUa4HfTwjZ4_YV2iVtEwyzXGS-CFFTHPkaGQ_aZOM"; 
const CONTRACT_ADDRESS = "0xd9145CCE52D386f254917e481eB44e9943F39138";

// This ABI matches the JournalistRecord contract 
const CONTRACT_ABI = [
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_ipfsHash",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_title",
				"type": "string"
			}
		],
		"name": "publishArticle",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "articles",
		"outputs": [
			{
				"internalType": "string",
				"name": "ipfsHash",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "title",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "author",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getAllArticles",
		"outputs": [
			{
				"components": [
					{
						"internalType": "string",
						"name": "ipfsHash",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "title",
						"type": "string"
					},
					{
						"internalType": "uint256",
						"name": "timestamp",
						"type": "uint256"
					},
					{
						"internalType": "address",
						"name": "author",
						"type": "address"
					}
				],
				"internalType": "struct JournalistRecord.Article[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];
// ---------------------------------------------------

function App() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('Idle');
  const [articles, setArticles] = useState([]);
  const [walletAddress, setWalletAddress] = useState('');

  // 1. Connect Wallet (Metamask)
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        setWalletAddress(accounts[0]);
      } catch (error) {
        console.error("User denied wallet connection", error);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  // 2. Upload JSON to IPFS via Pinata
  const uploadToIPFS = async () => {
    setStatus('Uploading text to IPFS...');
    
    // We store the text as a JSON object
    const articleData = {
      name: title,
      content: content
    };

    try {
      const res = await axios.post(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        articleData,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PINATA_JWT}`
          }
        }
      );
      return res.data.IpfsHash; // This is the CID (e.g., QmXoy...)
    } catch (error) {
      console.error("Error uploading to Pinata:", error);
      setStatus('Failed to upload to IPFS.');
      throw error;
    }
  };

  // 3. Publish to Blockchain
  const publishArticle = async () => {
    if (!title || !content) return alert("Please fill out both fields.");
    
    try {
      // Step A: Get the IPFS Hash
      const ipfsHash = await uploadToIPFS();
      
      // Step B: Send transaction to Smart Contract
      setStatus('Waiting for MetaMask transaction approval...');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      // Call the Solidity function
      const tx = await contract.publishArticle(ipfsHash, title);
      setStatus('Transaction sent! Waiting for block confirmation...');
      
      // Wait for the transaction to be mined
      await tx.wait();
      setStatus(`Success! Article anchored to blockchain. IPFS Hash: ${ipfsHash}`);
      
      // Clear form and refresh list
      setTitle('');
      setContent('');
      fetchArticles();

    } catch (error) {
      console.error(error);
      setStatus('Error publishing article.');
    }
  };

  // 4. Read from Blockchain
  const fetchArticles = async () => {
    if (!window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      
      const data = await contract.getAllArticles();
      setArticles(data);
    } catch (error) {
      console.error("Error fetching articles:", error);
    }
  };

  // Fetch articles on load
  useEffect(() => {
    fetchArticles();
  }, []);

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Veritas Protocol Prototype</h1>
      
      {!walletAddress ? (
        <button onClick={connectWallet} style={{ padding: '10px' }}>Connect MetaMask</button>
      ) : (
        <p>Connected: {walletAddress.substring(0, 6)}...{walletAddress.substring(38)}</p>
      )}

      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input 
          type="text" 
          placeholder="Article Title" 
          value={title} 
          onChange={(e) => setTitle(e.target.value)} 
          style={{ padding: '10px' }}
        />
        <textarea 
          placeholder="Write your article here..." 
          value={content} 
          onChange={(e) => setContent(e.target.value)} 
          rows={6}
          style={{ padding: '10px' }}
        />
        <button 
          onClick={publishArticle} 
          disabled={!walletAddress}
          style={{ padding: '10px', backgroundColor: 'black', color: 'white', cursor: 'pointer' }}
        >
          Sign & Publish to Blockchain
        </button>
      </div>

      <p style={{ fontWeight: 'bold', color: 'blue' }}>Status: {status}</p>

      <hr style={{ margin: '30px 0' }} />

      <h2>The Courtroom Record (On-Chain)</h2>
      <button onClick={fetchArticles} style={{ marginBottom: '10px' }}>Refresh Record</button>
      
      <ul style={{ listStyleType: 'none', padding: 0 }}>
        {articles.map((article, index) => (
          <li key={index} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
            <h3>{article.title}</h3>
            <p style={{ fontSize: '12px', color: 'gray' }}>Author: {article.author}</p>
            <p>
              <strong>IPFS Hash:</strong>{' '}
              <a href={`https://gateway.pinata.cloud/ipfs/${article.ipfsHash}`} target="_blank" rel="noreferrer">
                {article.ipfsHash}
              </a>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;