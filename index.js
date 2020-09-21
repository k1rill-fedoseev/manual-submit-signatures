const homeWeb3 = new Web3('https://dai.poa.network')
const foreignWeb3 = new Web3('https://mainnet.infura.io/v3/5d7bd94c50ed43fab1cb8e74f58678b0')

const homeAbi = [{
    "anonymous": false,
    "inputs": [
        {
            "indexed": false,
            "name": "authorityResponsibleForRelay",
            "type": "address"
        },
        {
            "indexed": false,
            "name": "messageHash",
            "type": "bytes32"
        },
        {
            "indexed": false,
            "name": "NumberOfCollectedSignatures",
            "type": "uint256"
        }
    ],
    "name": "CollectedSignatures",
    "type": "event"
},
{
    "constant": true,
    "inputs": [
        {
            "name": "_hash",
            "type": "bytes32"
        },
        {
            "name": "_index",
            "type": "uint256"
        }
    ],
    "name": "signature",
    "outputs": [
        {
            "name": "",
            "type": "bytes"
        }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
}]

const foreignAbi = [{
    "constant": false,
    "inputs": [
        {
            "name": "message",
            "type": "bytes"
        },
        {
            "name": "signatures",
            "type": "bytes"
        }
    ],
    "name": "executeSignatures",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
}]

const homeContract = new homeWeb3.eth.Contract(homeAbi, '0x7301CFA0e1756B71869E93d4e4Dca5c7d0eb0AA6')
const foreignContract = new homeWeb3.eth.Contract(foreignAbi, '0x4aa42145Aa6Ebf72e164C9bBC74fbD3788045016')

function strip0x(input) {
    return input.replace(/^0x/, '')
}

function createMessage({ recipient, value, transactionHash, bridgeAddress, expectedMessageLength }) {
    recipient = strip0x(recipient)

    value = homeWeb3.utils.numberToHex(value)
    value = homeWeb3.utils.padLeft(value, 32 * 2)

    value = strip0x(value)

    transactionHash = strip0x(transactionHash)

    bridgeAddress = strip0x(bridgeAddress)

    return `0x${recipient}${value}${transactionHash}${bridgeAddress}`
}

function signatureToVRS(rawSignature) {
    const signature = strip0x(rawSignature)
    const v = signature.substr(64 * 2)
    const r = signature.substr(0, 32 * 2)
    const s = signature.substr(32 * 2, 32 * 2)
    return { v, r, s }
}

function packSignatures(array) {
    const length = strip0x(homeWeb3.utils.toHex(array.length))
    const msgLength = length.length === 1 ? `0${length}` : length
    let v = ''
    let r = ''
    let s = ''
    array.forEach(e => {
        v = v.concat(e.v)
        r = r.concat(e.r)
        s = s.concat(e.s)
    })
    return `0x${msgLength}${v}${r}${s}`
}

async function submitSignatures() {
    if (typeof window.ethereum === 'undefined') {
        alert('No metamask found')
        return
    }

    const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
    const from = accounts[0]

    const txHash = document.getElementById('txHash').value

    if (txHash.substr(0, 2) !== '0x' || txHash.length !== 66) {
        alert('Enter valid tx hash')
        return
    }

    const { logs } = await homeWeb3.eth.getTransactionReceipt(txHash)
    if (!logs) {
        alert('No tx found')
        return
    }
    const requestEvent = logs.find(x => x.topics[0] === '0x127650bcfb0ba017401abe4931453a405140a8fd36fece67bae2db174d3fdd63')
    if (!requestEvent) {
        alert('No UserRequestForSignature event found')
        return
    }
    const data = homeWeb3.eth.abi.decodeParameters(['address', 'uint256'], requestEvent.data)
    const recipient = data['0']
    const value = data['1']

    const message = createMessage({
        recipient,
        value,
        transactionHash: txHash,
        bridgeAddress: foreignContract.options.address
    })
    const messageHash = homeWeb3.utils.soliditySha3(message)

    let events = await homeContract.getPastEvents('CollectedSignatures', { fromBlock: 12123723 })
    events = events.filter(x => x.returnValues.messageHash === messageHash)
    if (events.length === 0) {
        alert('No CollectedSignatures event found. Try again later')
        return
    }
    const event = events[0]
    const n = parseInt(event.returnValues.NumberOfCollectedSignatures)

    const signaturesArray = []

    for (let i = 0; i < n; i++) {
        const signature = await homeContract.methods.signature(messageHash, i).call()
        const vrs = signatureToVRS(signature)
        signaturesArray.push(vrs)
    }

    const signatures = packSignatures(signaturesArray)

    const calldata = foreignContract.methods.executeSignatures(message, signatures).encodeABI()

    const transactionParameters = {
        to: foreignContract.options.address,
        from,
        value: '0x00',
        data: calldata
    }

    const foreignTxHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [transactionParameters],
    })

    alert('Send a tx ' + foreignTxHash)
}
