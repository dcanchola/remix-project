/* global ethereum */
'use strict'
import Web3 from 'web3'
import EventManager from '../lib/events'
import { rlp, keccak, bufferToHex } from 'ethereumjs-util'
const remixLib = require('@remix-project/remix-lib')
const { Web3VMProvider } = remixLib.vm
const EthJSVM = require('ethereumjs-vm').default
const StateManager = require('ethereumjs-vm/dist/state/stateManager').default

let web3

if (typeof window !== 'undefined' && typeof window.ethereum !== 'undefined') {
  var injectedProvider = window.ethereum
  web3 = new Web3(injectedProvider)
} else {
  web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))
}

/*
  extend vm state manager and instanciate VM
*/

class StateManagerCommonStorageDump extends StateManager {
  constructor (arg) {
    super(arg)
    this.keyHashes = {}
  }

  putContractStorage (address, key, value, cb) {
    this.keyHashes[keccak(key).toString('hex')] = bufferToHex(key)
    super.putContractStorage(address, key, value, cb)
  }

  dumpStorage (address, cb) {
    this._getStorageTrie(address, (err, trie) => {
      if (err) {
        return cb(err)
      }
      const storage = {}
      const stream = trie.createReadStream()
      stream.on('data', (val) => {
        const value = rlp.decode(val.value)
        storage['0x' + val.key.toString('hex')] = {
          key: this.keyHashes[val.key.toString('hex')],
          value: '0x' + value.toString('hex')
        }
      })
      stream.on('end', function () {
        cb(storage)
      })
    })
  }

  getStateRoot (cb) {
    const checkpoint = this._checkpointCount
    this._checkpointCount = 0
    super.getStateRoot((err, stateRoot) => {
      this._checkpointCount = checkpoint
      cb(err, stateRoot)
    })
  }

  setStateRoot (stateRoot, cb) {
    const checkpoint = this._checkpointCount
    this._checkpointCount = 0
    super.setStateRoot(stateRoot, (err) => {
      this._checkpointCount = checkpoint
      cb(err)
    })
  }
}

/*
  trigger contextChanged, web3EndpointChanged
*/
export class ExecutionContext {
  constructor () {
    this.event = new EventManager()
    this.executionContext = null
    this.blockGasLimitDefault = 4300000
    this.blockGasLimit = this.blockGasLimitDefault
    this.currentFork = 'muirGlacier'
    this.vms = {
      /*
      byzantium: createVm('byzantium'),
      constantinople: createVm('constantinople'),
      petersburg: createVm('petersburg'),
      istanbul: createVm('istanbul'),
      */
      muirGlacier: this.createVm('muirGlacier')
    }
    this.mainNetGenesisHash = '0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3'
    this.customNetWorks = {}
    this.blocks = {}
    this.latestBlockNumber = 0
    this.txs = {}
    this.customWeb3 = {} // mapping between a context name and a web3.js instance
  }

  init (config) {
    if (config.get('settings/always-use-vm')) {
      this.executionContext = 'vm'
    } else {
      this.executionContext = injectedProvider ? 'injected' : 'vm'
      if (this.executionContext === 'injected') this.askPermission()
    }
  }

  createVm (hardfork) {
    const stateManager = new StateManagerCommonStorageDump({})
    stateManager.checkpoint(() => {})
    const vm = new EthJSVM({
      activatePrecompiles: true,
      blockchain: stateManager.blockchain,
      stateManager: stateManager,
      hardfork: hardfork
    })
    vm.blockchain.validate = false
    const web3vm = new Web3VMProvider()
    web3vm.setVM(vm)
    return { vm, web3vm, stateManager }
  }

  askPermission () {
    // metamask
    if (ethereum && typeof ethereum.enable === 'function') ethereum.enable()
  }

  getProvider () {
    return this.executionContext
  }

  isVM () {
    return this.executionContext === 'vm'
  }

  setWeb3 (context, web3) {
    this.customWeb3[context] = web3
  }

  web3 () {
    if (this.customWeb3[this.executionContext]) return this.customWeb3[this.executionContext]
    return this.isVM() ? this.vms[this.currentFork].web3vm : web3
  }

  detectNetwork (callback) {
    if (this.isVM()) {
      callback(null, { id: '-', name: 'VM' })
    } else {
      web3.eth.net.getId((err, id) => {
        let name = null
        if (err) name = 'Unknown'
        // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-155.md
        else if (id === 1) name = 'Main'
        else if (id === 2) name = 'Morden (deprecated)'
        else if (id === 3) name = 'Ropsten'
        else if (id === 4) name = 'Rinkeby'
        else if (id === 5) name = 'Goerli'
        else if (id === 42) name = 'Kovan'
        else name = 'Custom'

        if (id === '1') {
          web3.eth.getBlock(0, (error, block) => {
            if (error) console.log('cant query first block')
            if (block && block.hash !== this.mainNetGenesisHash) name = 'Custom'
            callback(err, { id, name })
          })
        } else {
          callback(err, { id, name })
        }
      })
    }
  }

  removeProvider (name) {
    if (name && this.customNetWorks[name]) {
      if (this.executionContext === name) this.setContext('vm', null, null, null)
      delete this.customNetWorks[name]
      this.event.trigger('removeProvider', [name])
    }
  }

  addProvider (network) {
    if (network && network.name && !this.customNetWorks[network.name]) {
      this.customNetWorks[network.name] = network
      this.event.trigger('addProvider', [network])
    }
  }

  internalWeb3 () {
    return web3
  }

  blankWeb3 () {
    return new Web3()
  }

  vm () {
    return this.vms[this.currentFork].vm
  }

  setContext (context, endPointUrl, confirmCb, infoCb) {
    this.executionContext = context
    this.executionContextChange(context, endPointUrl, confirmCb, infoCb, null)
  }

  executionContextChange (context, endPointUrl, confirmCb, infoCb, cb) {
    if (!cb) cb = () => {}
    if (!confirmCb) confirmCb = () => {}
    if (!infoCb) infoCb = () => {}
    if (context === 'vm') {
      this.executionContext = context
      this.vms[this.currentFork].stateManager.revert(() => {
        this.vms[this.currentFork].stateManager.checkpoint(() => {})
      })
      this.event.trigger('contextChanged', ['vm'])
      return cb()
    }

    if (context === 'injected') {
      if (injectedProvider === undefined) {
        infoCb('No injected Web3 provider found. Make sure your provider (e.g. MetaMask) is active and running (when recently activated you may have to reload the page).')
        return cb()
      } else {
        this.askPermission()
        this.executionContext = context
        web3.setProvider(injectedProvider)
        this._updateBlockGasLimit()
        this.event.trigger('contextChanged', ['injected'])
        return cb()
      }
    }

    if (context === 'web3') {
      confirmCb(cb)
    }

    if (this.customNetWorks[context]) {
      var network = this.customNetWorks[context]
      this.setProviderFromEndpoint(network.provider, network.name, (error) => {
        if (error) infoCb(error)
        cb()
      })
    }
  }

  currentblockGasLimit () {
    return this.blockGasLimit
  }

  stopListenOnLastBlock () {
    if (this.listenOnLastBlockId) clearInterval(this.listenOnLastBlockId)
    this.listenOnLastBlockId = null
  }

  _updateBlockGasLimit () {
    if (this.getProvider() !== 'vm') {
      web3.eth.getBlock('latest', (err, block) => {
        if (!err) {
          // we can't use the blockGasLimit cause the next blocks could have a lower limit : https://github.com/ethereum/remix/issues/506
          this.blockGasLimit = (block && block.gasLimit) ? Math.floor(block.gasLimit - (5 * block.gasLimit) / 1024) : this.blockGasLimitDefault
        } else {
          this.blockGasLimit = this.blockGasLimitDefault
        }
      })
    }
  }

  listenOnLastBlock () {
    this.listenOnLastBlockId = setInterval(() => {
      this._updateBlockGasLimit()
    }, 15000)
  }

  // TODO: remove this when this function is moved

  setProviderFromEndpoint (endpoint, context, cb) {
    const oldProvider = web3.currentProvider

    web3.setProvider(endpoint)

    web3.eth.net.isListening((err, isConnected) => {
      if (!err && isConnected) {
        this.executionContext = context
        this._updateBlockGasLimit()
        this.event.trigger('contextChanged', [context])
        this.event.trigger('web3EndpointChanged')
        cb()
      } else {
        web3.setProvider(oldProvider)
        cb('Not possible to connect to the Web3 provider. Make sure the provider is running, a connection is open (via IPC or RPC) or that the provider plugin is properly configured.')
      }
    })
  }

  txDetailsLink (network, hash) {
    const transactionDetailsLinks = {
      Main: 'https://www.etherscan.io/tx/',
      Rinkeby: 'https://rinkeby.etherscan.io/tx/',
      Ropsten: 'https://ropsten.etherscan.io/tx/',
      Kovan: 'https://kovan.etherscan.io/tx/',
      Goerli: 'https://goerli.etherscan.io/tx/'
    }

    if (transactionDetailsLinks[network]) {
      return transactionDetailsLinks[network] + hash
    }
  }
}