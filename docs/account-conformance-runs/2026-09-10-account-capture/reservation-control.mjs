export default {
  plugins: [{name:'reservation-regression-control',enforce:'pre',transform(code,id){
    if(!id.endsWith('/src/crdt/admissionQueue.ts'))return;
    const anchor='job.reservation = 2 * job.input.length + MAX_JOURNAL_UPDATE;';
    if(code.split(anchor).length!==2)throw Error('Missing/ambiguous reservation control');
    return code.replace(anchor,'void 0;');
  }}],test:{environment:'node',include:['test/sourceCapture.test.ts']}
};
