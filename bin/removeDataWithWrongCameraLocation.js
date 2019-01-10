const loopback = require('loopback');

const DATASOURCE_NAME = 'ctMongoDb40';

const env = loopback().get('env');

let dataSourceConfig;
if (env === 'development') {
  // eslint-disable-next-line import/no-unresolved
  dataSourceConfig = require('../server/datasources.development.js');
} else {
  dataSourceConfig = require('../server/datasources.json');
}

const ctMongoDb40 = new loopback.DataSource(dataSourceConfig[DATASOURCE_NAME]);

// eslint-disable-next-line space-before-function-paren
ctMongoDb40.connector.connect(async (err, db) => {
  const MultimediaAnnotation = db.collection('MultimediaAnnotation');
  const Project = db.collection('Project');

  const projects = await Project.find(
    {},
    { 'cameraLocations.fullCameraLocationMd5': 1 },
  ).toArray();
  const projectCameraLocations = {};
  projects.map(p => {
    projectCameraLocations[p._id] = p.cameraLocations.map(
      cl => cl.fullCameraLocationMd5,
    );
    return '';
  });
  // console.log(projectCameraLocations);
  const pids = Object.keys(projectCameraLocations);
  const countQuerys = [];
  const deleteQuerys = [];
  const queryConditions = [];
  pids.slice(15).map(pid => {
    if (projectCameraLocations[pid].length > 0) {
      console.log(pid);
      const queryCondition = {
        projectId: pid,
        fullCameraLocationMd5: {
          $nin: projectCameraLocations[pid],
        },
      };
      queryConditions.push(queryCondition);
      countQuerys.push(MultimediaAnnotation.find(queryCondition).count());
    }
    return '';
  });

  Promise.all(countQuerys).then(docCounts => {
    console.log(docCounts);
    docCounts.map((cnt, idx) => {
      if (cnt > 0) {
        console.log(queryConditions[idx]);
        deleteQuerys.push(MultimediaAnnotation.deleteMany(queryConditions));
      }
      return '';
    });
    if (deleteQuerys.length > 0) {
      Promise.all(deleteQuerys).then(results => {
        console.log('Done!!');
        console.log(results);
        process.exit();
      });
    } else {
      process.exit();
    }
  });
});
