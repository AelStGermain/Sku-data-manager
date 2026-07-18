const fs = require('fs');
const db = require('./local_data/master_catalog.json');
const fp = db.find(x => x.data_source === 'levantamiento' || x.dataSource === 'levantamiento' || x.fromFirebase);
console.log(JSON.stringify(fp, null, 2));
