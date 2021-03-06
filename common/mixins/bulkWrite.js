module.exports = function(Model, options) {
  Model.remoteMethod('bulkInsert', {
    http: { path: '/bulk-insert', verb: 'post' },
    accepts: { arg: 'data', type: 'array', http: { source: 'body' } },
    returns: { arg: 'ret', type: 'object' },
  });

  Model.remoteMethod('bulkReplace', {
    http: { path: '/bulk-replace', verb: 'post' },
    accepts: { arg: 'data', type: 'array', http: { source: 'body' } },
    returns: { arg: 'ret', type: 'object' },
  });

  Model.remoteMethod('bulkUpdate', {
    http: { path: '/bulk-update', verb: 'post' },
    accepts: { arg: 'data', type: 'array', http: { source: 'body' } },
    returns: { arg: 'ret', type: 'object' },
  });

  const _writeWrapper = function(documents, opName) {
    switch (opName) {
      case 'insertOne':
        documents.forEach((doc, idx, arr) => {
          arr[idx] = { insertOne: { document: doc } };
        });
        break;
      case 'replaceOne':
        documents.forEach((doc, idx, arr) => {
          arr[idx] = {
            replaceOne: {
              filter: { _id: doc._id },
              replacement: doc,
              upsert: true,
            },
          };
        });
        break;
      case 'updateOne':
        documents.forEach((doc, idx, arr) => {
          /* Example Document，注意，這跟 mongodb 的寫法不盡相同
          {
            _id: some_id_string,
            $set: {
              key1: value1,
              key2: [
                {sub_key1: sub_value1},
                {sub_key2: [...]},
                ...
              ]
            },
            $addToSet: {
              array_name: unique_value_to_add
            },
            $setOnInsert: true / false
          }
          // */

          const filter = { _id: doc._id };
          const update = {};
          let upsert = false;
          if (doc.$set) update.$set = doc.$set;
          if (doc.$addToSet) update.$addToSet = doc.$addToSet;
          if (doc.$push) update.$push = doc.$push;
          if (doc.$setOnInsert) {
            if (typeof doc.$setOnInsert === 'object') {
              update.$setOnInsert = doc.$setOnInsert;
            }
            upsert = true;
          }
          if (!!doc.$upsert === true) {
            upsert = true;
          }

          arr[idx] = {
            updateOne: { filter, update, upsert },
          };
        });
        break;
      default:
      // error
    }

    return documents;
  };

  Model.bulkInsert = function(documents, callback) {
    documents = _writeWrapper(documents, 'insertOne').filter(d => !!d);
    if (documents.length === 0) {
      callback(null, []);
      return;
    }

    Model.getDataSource().connector.connect((err, db) => {
      const _callback = callback;
      const collection = db.collection(Model.definition.name);

      collection.bulkWrite(documents, { ordered: false }, (_err, results) => {
        if (_err) {
          _callback(_err);
        } else {
          _callback(null, results);
        }
      });
    });
  };

  Model.bulkReplace = function(documents, callback) {
    documents = _writeWrapper(documents, 'replaceOne').filter(d => !!d);
    if (documents.length === 0) {
      callback(null, []);
      return;
    }

    Model.getDataSource().connector.connect((err, db) => {
      const _callback = callback;
      const collection = db.collection(Model.definition.name);

      collection.bulkWrite(documents, { ordered: false }, (_err, results) => {
        if (_err) {
          _callback(_err);
        } else {
          _callback(null, results);
        }
      });
    });
  };

  Model.bulkUpdate = function(documents, callback) {
    documents = _writeWrapper(documents, 'updateOne').filter(d => !!d);
    if (documents.length === 0) {
      callback(null, []);
      return;
    }

    Model.getDataSource().connector.connect((err, db) => {
      const _callback = callback;
      const collection = db.collection(Model.definition.name);

      collection.bulkWrite(documents, { ordered: false }, (_err, results) => {
        if (_err) {
          _callback(_err);
        } else {
          _callback(null, results);
        }
      });
    });
  };
};
