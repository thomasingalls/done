// Dedicated predecessor worker with an open native source connection. The controller closes its parent.
self.onmessage = (event) => {
  if (event.data === 'ready') {
    const request = indexedDB.open('done', 1);
    request.onupgradeneeded = () => request.transaction.abort();
    request.onsuccess = () => {
      self.sourceDatabase = request.result;
      postMessage('ready');
    };
  }
};
