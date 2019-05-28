import { Analyser } from '../analyser/SQLDFlowAnalizer';
import { HttpClient } from '@angular/common/http';

declare var $: any;
declare var require: any;
const config = require('./../../config.json');

export class LeaksWhenRequests {

  public static sendGARequest(http: HttpClient, schemas, queries, tableDatas, policy, attackerSettings, attackerAdvantage, callback) {
    const apiURL = config.leakswhen.host + config.leakswhen.ga;

    return http.post(apiURL, { schema: schemas, queries: queries, tableDatas: tableDatas, policy: policy, attackerSettings: attackerSettings, attackerAdvantage: attackerAdvantage })
      .toPromise()
      .then(
      (res: any) => {
          callback(res.result);
          return true;
        },
        err => {
          $('#leaksWhenServerError').show();
          $('#analysis-results-panel').hide();
          $('.analysis-spinner').hide();
          return true;
        });
  }

  public static sendPreparationRequest(http: HttpClient, diagramId, petri, matcher, selectedDataObjects, taskDtoOrdering, participants, simplificationTarget, promiseChain) {
    const apiURL = config.leakswhen.host + config.leakswhen.compute;

    return http.post(apiURL, { diagram_id: diagramId, petri: petri })
      .toPromise()
      .then(
          (res: any) => {
          let runs = res.runs;
          // console.log(runs);

          runs = runs.filter(run => {
            return run.reduce((acc, cur) => acc || cur.includes('EndEvent'), false);
          });

          return runs.reduce((acc, run, runNumber) => acc.then(() => {
            const sqlCommands = run.reduce((acc, id) => acc + (matcher[id] ? matcher[id] + '\n' : ''), '');

            return selectedDataObjects.reduce((acc, currentOutputDto) => acc.then(() => {
              // We select participant that contains selected data object
              const currentParticipant = participants.filter(x => !!x.policies.find(p => p.name == currentOutputDto.id))[0];
              const orderedDtos = {};
              let currentOrderingIndex = 0;

              // We should take policies only from those data objects that topologically preceed selected one
              for (let i = 0; i < run.length; i++) {
                if (run[i].indexOf('Task') != -1) {
                  for (let j = 0; j < taskDtoOrdering[run[i]].length; j++) {
                    if (run.indexOf(taskDtoOrdering[run[i]][j]) == -1) {
                      orderedDtos[taskDtoOrdering[run[i]][j]] = currentOrderingIndex;
                    }
                  }
                } else {
                  orderedDtos[run[i]] = currentOrderingIndex;
                }
                currentOrderingIndex++;
              }

              const indexOfOutputDto = orderedDtos[currentOutputDto.id];
              const requestPolicies = currentParticipant
                ? currentParticipant.policies.filter(x => (orderedDtos[x.name] <= indexOfOutputDto || x.name == 'laneScript') && !!x.script)
                : [];
              const processedOutputDto = currentOutputDto.name.split(' ').map(word => word.toLowerCase()).join('_');

              return LeaksWhenRequests.sendLeaksWhenRequest(http, diagramId, sqlCommands, [processedOutputDto], requestPolicies.map(x => x.script), promiseChain, runNumber, simplificationTarget);
            }), Promise.resolve());
          }), Promise.resolve());
        });
  }

  static sendLeaksWhenRequest(http: HttpClient, diagramId, sqlCommands, processedLabels, policy, promises, runNumber, simplificationTarget) {
    const self = this;
    const apiURL = config.leakswhen.host + config.leakswhen.report;
    const modelPath = `${diagramId}/run_${runNumber}/${processedLabels[0]}`;

    return http.post(apiURL, { diagram_id: diagramId, simplificationTarget: simplificationTarget, run_number: runNumber, selected_dto: processedLabels[0], model: modelPath, targets: processedLabels.join(','), sql_script: sqlCommands, policy: policy })
      .toPromise()
      .then(
      (res: any) => {
          const files = res.files;

          const legend = files.filter(x => x.indexOf('legend') != -1)[0];
          const namePathMapping = {};
          files.filter(x => x.indexOf('legend') == -1)
            .forEach(path => namePathMapping[path.split('/').pop()] = path);

          //let url1 = config.leakswhen.host + legend.replace("leaks-when/", "");
          const url1 = config.leakswhen.host + legend;
          return http.get(url1)
            .toPromise()
            .then((res2: any) => {
              const legendObject = res2;

              return Object.keys(legendObject).reduce((acc, key) => acc.then(() => {
                const clojuredKey = key;

                return legendObject[clojuredKey].reduce((acc, fileName, fileIndex) => acc.then(resOverlayInsert => {
                  //let url2 = config.leakswhen.host + namePathMapping[fileName].replace("leaks-when/", "");
                  const url2 = config.leakswhen.host + namePathMapping[fileName];
                  const overlayInsert = fileIndex > 0 ? resOverlayInsert : ``;

                  return self.sendLegendFileRequest(http, modelPath, url2, overlayInsert, clojuredKey, legendObject, fileIndex, simplificationTarget);
                }), Promise.resolve());
              }), Promise.resolve());
            });
        }
      );
  }

  static sendLegendFileRequest(http: HttpClient, modelPath, url2, overlayInsert, clojuredKey, legendObject, fileCounter, simplificationTarget) {

    // return http.get(url2)
    //   .toPromise()
    //   .then(res => {
    //     let response = (<any>res)._body;

    const urlParts = url2.split('/');
    const fileNameParts = url2.split('/')[urlParts.length - 1].split('.')[0].split('_');
    const gid = fileNameParts[fileNameParts.length - 1];

    overlayInsert += `
            <div align="left" class="panel-heading">
              <b>` + clojuredKey + '(' + fileCounter + ')' + `</b>
            </div>
            <div class="panel-body">
              <div>
                <a href="${config.frontend.host}/graph/${modelPath}/leakage_from_${gid}" target="_blank">View graph</a>
              </div>
            </div>`;

    if (fileCounter === legendObject[clojuredKey].length - 1) {
      const overlayHtml = $(`
                <div class="code-dialog" id="` + clojuredKey + `-analysis-results">
                  <div class="panel panel-default">` + overlayInsert + `</div></div>`
      );
      const nameWithSimplificationTarget = clojuredKey + (simplificationTarget ? `(${simplificationTarget})` : '');
      Analyser.analysisCompleted.emit({ node: { id: 'Output' + clojuredKey + fileCounter, name: nameWithSimplificationTarget }, overlayHtml: overlayHtml });
    }

    return overlayInsert;
    // });
  }

}
