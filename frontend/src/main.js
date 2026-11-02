import { decodeEventLog, decodeFunctionResult, encodeFunctionData, isAddress, parseAbi, toEventSelector } from 'viem';
import './style.css';

const abi = parseAbi([
  'function transactionCount() view returns (uint256)',
  'function recordTransfer(address recipient, uint256 amount)',
  'event TransferRecorded(address indexed sender, address indexed recipient, uint256 amount, uint256 timestamp)',
]);
const event = abi.find((item) => item.type === 'event');
const $ = (selector) => document.querySelector(selector);
const ui = {
  connect: $('#connectButton'), load: $('#loadButton'), refresh: $('#refreshButton'),
  form: $('#recordForm'), record: $('#recordButton'), address: $('#contractAddress'),
  recipient: $('#recipient'), amount: $('#amount'), feedback: $('#feedback'),
  wallet: $('#walletStatus'), network: $('#networkStatus'), chain: $('#chainId'),
  count: $('#transactionCount'), rows: $('#eventRows'), hint: $('#transactionHint'),
};

let provider;
let account;
let chainId;
let contractAddress;
let busy = false;
let localMode = false;

const localProvider = {
  async request({ method, params = [] }) {
    let response;
    try {
      response = await fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
    } catch {
      throw new Error('Anvil недоступен. Запустите `anvil` в отдельном терминале.');
    }
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  },
};

function message(text, kind = 'info') {
  ui.feedback.textContent = text;
  ui.feedback.dataset.kind = kind;
}

function short(value) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function storageKey() { return `chainguard:contract:${chainId}`; }
function renderConnection() {
  ui.wallet.textContent = account ? `${localMode ? 'Anvil' : 'Кошелёк'} · ${short(account)}` : 'Кошелёк не подключён';
  ui.network.textContent = chainId ? `Сеть с ID ${chainId}` : 'Выберите кошелёк, чтобы начать работу';
  ui.chain.textContent = chainId ?? '—';
  ui.connect.textContent = account ? 'Подключено' : window.ethereum ? 'Подключить кошелёк' : 'Подключить Anvil';
  ui.hint.innerHTML = localMode
    ? 'Транзакция вызовет <code>recordTransfer</code> в локальной сети Anvil с тестового аккаунта. Подтверждение в кошельке не требуется.'
    : 'Транзакция вызовет <code>recordTransfer</code> и потребует подтверждения в кошельке и оплаты газа.';
}
function clearContract() {
  contractAddress = undefined;
  ui.count.textContent = '—';
  ui.rows.innerHTML = '<tr><td colspan="5" class="empty-state">Подключите кошелёк и контракт, чтобы увидеть события.</td></tr>';
}
function setBusy(value) {
  busy = value;
  ui.connect.disabled = value;
  ui.load.disabled = value;
  ui.refresh.disabled = value;
  ui.record.disabled = value;
}
async function rpc(method, params = []) {
  if (!provider) throw new Error('Сначала подключите кошелёк.');
  return provider.request({ method, params });
}
async function syncWallet() {
  const accounts = await rpc('eth_accounts');
  account = accounts[0];
  chainId = Number.parseInt(await rpc('eth_chainId'), 16);
  clearContract();
  ui.address.value = localStorage.getItem(storageKey()) ?? '';
  renderConnection();
  if (account && ui.address.value) await loadContract();
}
async function connectWallet() {
  localMode = !window.ethereum;
  provider = window.ethereum ?? localProvider;
  const accounts = await rpc(localMode ? 'eth_accounts' : 'eth_requestAccounts');
  if (!accounts.length) throw new Error('Кошелёк не предоставил адрес.');
  await syncWallet();
  message(chainId === 31337
    ? `${localMode ? 'Anvil' : 'Кошелёк'} подключён. Введите адрес контракта.`
    : 'Для этого прототипа переключите кошелёк на локальную сеть Anvil (ID 31337).', chainId === 31337 ? 'info' : 'error');
}
async function loadContract() {
  if (!account) throw new Error('Сначала подключите кошелёк.');
  if (chainId !== 31337) throw new Error('Прототип работает только с локальной сетью Anvil (ID 31337).');
  const address = ui.address.value.trim();
  if (!isAddress(address)) throw new Error('Введите корректный адрес контракта Ethereum.');
  const code = await rpc('eth_getCode', [address, 'latest']);
  if (!code || code === '0x') throw new Error('По этому адресу в выбранной сети нет контракта.');
  const data = encodeFunctionData({ abi, functionName: 'transactionCount' });
  const result = await rpc('eth_call', [{ to: address, data }, 'latest']);
  const count = decodeFunctionResult({ abi, functionName: 'transactionCount', data: result });
  contractAddress = address;
  localStorage.setItem(storageKey(), address);
  ui.count.textContent = count.toString();
  await loadEvents();
  message('Контракт загружен.');
}
async function loadEvents() {
  if (!contractAddress) throw new Error('Сначала загрузите контракт.');
  const latest = BigInt(await rpc('eth_blockNumber'));
  const from = latest > 5000n ? latest - 5000n : 0n;
  const logs = await rpc('eth_getLogs', [{
    address: contractAddress,
    topics: [toEventSelector(event)],
    fromBlock: `0x${from.toString(16)}`,
    toBlock: 'latest',
  }]);
  const entries = logs.slice(-50).reverse().map((log) => ({
    ...decodeEventLog({ abi, data: log.data, topics: log.topics }),
    transactionHash: log.transactionHash,
  }));
  ui.rows.replaceChildren();
  if (!entries.length) {
    const row = ui.rows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.className = 'empty-state';
    cell.textContent = 'В последних 5 000 блоках событий нет.';
    return;
  }
  for (const entry of entries) {
    const row = ui.rows.insertRow();
    const { sender, recipient, amount, timestamp } = entry.args;
    for (const value of [short(sender), short(recipient), amount.toString(), new Date(Number(timestamp) * 1000).toLocaleString('ru-RU')]) {
      const cell = row.insertCell();
      cell.textContent = value;
      if (value.includes('…')) cell.title = value === short(sender) ? sender : recipient;
    }
    const cell = row.insertCell();
    const code = document.createElement('code');
    code.textContent = short(entry.transactionHash);
    code.title = entry.transactionHash;
    cell.append(code);
  }
}
async function recordTransfer() {
  if (!contractAddress) throw new Error('Сначала загрузите контракт.');
  if (!account) throw new Error('Сначала подключите кошелёк.');
  if (chainId !== 31337) throw new Error('Прототип работает только с локальной сетью Anvil (ID 31337).');
  const recipient = ui.recipient.value.trim();
  const rawAmount = ui.amount.value.trim();
  if (!isAddress(recipient) || /^0x0{40}$/i.test(recipient)) throw new Error('Введите ненулевой адрес получателя.');
  if (!/^[0-9]+$/.test(rawAmount) || BigInt(rawAmount) === 0n) throw new Error('Сумма должна быть положительным целым числом.');
  const data = encodeFunctionData({ abi, functionName: 'recordTransfer', args: [recipient, BigInt(rawAmount)] });
  const hash = await rpc('eth_sendTransaction', [{ from: account, to: contractAddress, data }]);
  message(`Транзакция отправлена: ${short(hash)}. Ожидаем подтверждения…`);
  let receipt;
  for (let attempt = 0; attempt < 60 && !receipt; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    receipt = await rpc('eth_getTransactionReceipt', [hash]);
  }
  if (!receipt) throw new Error(`Транзакция ${short(hash)} отправлена, но подтверждение пока не получено. Обновите историю позже.`);
  if (receipt.status !== '0x1') throw new Error(`Транзакция ${short(hash)} отклонена сетью.`);
  ui.form.reset();
  await loadContract();
  message(`Запись подтверждена в сети. Транзакция: ${short(hash)}.`);
}
async function run(action) {
  if (busy) return;
  setBusy(true);
  try { await action(); }
  catch (error) { message(error?.shortMessage || error?.message || 'Неизвестная ошибка.', 'error'); }
  finally { setBusy(false); }
}

ui.connect.addEventListener('click', () => run(connectWallet));
ui.load.addEventListener('click', () => run(loadContract));
ui.refresh.addEventListener('click', () => run(async () => { await loadContract(); message('Данные обновлены.'); }));
ui.form.addEventListener('submit', (event) => { event.preventDefault(); run(recordTransfer); });
if (window.ethereum) {
  provider = window.ethereum;
  provider.on?.('accountsChanged', () => run(syncWallet));
  provider.on?.('chainChanged', () => run(syncWallet));
  run(syncWallet);
}
renderConnection();
