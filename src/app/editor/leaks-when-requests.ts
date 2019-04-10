import { Http } from '@angular/http';
import { Analyser } from "../analyser/SQLDFlowAnalizer";

declare var $: any;
declare var require: any
var config = require('./../../config.json');

export class LeaksWhenRequests {

  public static sendGARequest(http: Http, schemas, queries, tableDatas, policy, attackerSettings, attackerAdvantage, callback) {
    let apiURL = config.leakswhen.host + config.leakswhen.ga;

    return http.post(apiURL, { schema: schemas, queries: queries, tableDatas: tableDatas, policy: policy, attackerSettings: attackerSettings, attackerAdvantage: attackerAdvantage })
      .toPromise()
      .then(
        res => {
          callback(res.json().result);
          return true;
        },
        err => {
          $('#leaksWhenServerError').show();
          $('#analysis-results-panel').hide();
          $('.analysis-spinner').hide();
          return true;
        });
  }

  public static sendPreparationRequest(http: Http, diagramId, petri, matcher, selectedDataObjects, taskDtoOrdering, participants, simplificationTarget, promiseChain) {
    let apiURL = config.leakswhen.host + config.leakswhen.compute;

    return http.post(apiURL, { diagram_id: diagramId, petri: petri })
      .toPromise()
      .then(
        res => {
          let runs = res.json().runs;
          // console.log(runs);

          runs = runs.filter(run => {
            return run.reduce((acc, cur) => { return acc || cur.includes('EndEvent') }, false);
          });

          return runs.reduce((acc, run, runNumber) => acc.then(res => {
            let sqlCommands = run.reduce((acc, id) => acc + (matcher[id] ? matcher[id] + '\n' : ''), '');

            return selectedDataObjects.reduce((acc, currentOutputDto) => acc.then(res => {
              // We select participant that contains selected data object
              let currentParticipant = participants.filter(x => !!x.policies.find(p => p.name == currentOutputDto.id))[0];
              let orderedDtos = {};
              let currentOrderingIndex = 0;

              // We should take policies only from those data objects that topologically preceed selected one
              for (let i = 0; i < run.length; i++) {
                if (run[i].indexOf('Task') != -1) {
                  for (let j = 0; j < taskDtoOrdering[run[i]].length; j++) {
                    if (run.indexOf(taskDtoOrdering[run[i]][j]) == -1) {
                      orderedDtos[taskDtoOrdering[run[i]][j]] = currentOrderingIndex;
                    }
                  }
                }
                else {
                  orderedDtos[run[i]] = currentOrderingIndex;
                }
                currentOrderingIndex++;
              }

              let indexOfOutputDto = orderedDtos[currentOutputDto.id];
              let requestPolicies = currentParticipant
                ? currentParticipant.policies.filter(x => (orderedDtos[x.name] <= indexOfOutputDto || x.name == 'laneScript') && !!x.script)
                : [];
              let processedOutputDto = currentOutputDto.name.split(" ").map(word => word.toLowerCase()).join("_");

              return LeaksWhenRequests.sendLeaksWhenRequest(http, diagramId, sqlCommands, [processedOutputDto], requestPolicies.map(x => x.script), promiseChain, runNumber, simplificationTarget);
            }), Promise.resolve());
          }), Promise.resolve());
        });
  }

  static sendLeaksWhenRequest(http: Http, diagramId, sqlCommands, processedLabels, policy, promises, runNumber, simplificationTarget) {
    let self = this;
    let apiURL = config.leakswhen.host + config.leakswhen.report;
    let modelPath = `${diagramId}/run_${runNumber}/${processedLabels[0]}`;

    return http.post(apiURL, { diagram_id: diagramId, simplificationTarget: simplificationTarget, run_number: runNumber, selected_dto: processedLabels[0], model: modelPath, targets: processedLabels.join(','), sql_script: sqlCommands, policy: policy })
      .toPromise()
      .then(
        res => {
          let files = res.json().files;

          let legend = files.filter(x => x.indexOf('legend') != -1)[0];
          let namePathMapping = {};
          files.filter(x => x.indexOf('legend') == -1)
            .forEach(path => namePathMapping[path.split('/').pop()] = path);

          //let url1 = config.leakswhen.host + legend.replace("leaks-when/", "");
          let url1 = config.leakswhen.host + legend;
          return http.get(url1)
            .toPromise()
            .then(res => {
              let legendObject = res.json();

              return Object.keys(legendObject).reduce((acc, key) => acc.then(res => {
                let clojuredKey = key;

                return legendObject[clojuredKey].reduce((acc, fileName, fileIndex) => acc.then(resOverlayInsert => {
                  //let url2 = config.leakswhen.host + namePathMapping[fileName].replace("leaks-when/", "");
                  let url2 = config.leakswhen.host + namePathMapping[fileName];
                  let overlayInsert = fileIndex > 0 ? resOverlayInsert : ``;

                  return self.sendLegendFileRequest(http, modelPath, url2, overlayInsert, clojuredKey, legendObject, fileIndex, simplificationTarget);
                }), Promise.resolve());
              }), Promise.resolve());
            });
        }
      );
  }

  static sendLegendFileRequest(http: Http, modelPath, url2, overlayInsert, clojuredKey, legendObject, fileCounter, simplificationTarget) {
    let self = this;

    return http.get(url2)
      .toPromise()
      .then(res => {
        let response = (<any>res)._body;

        let urlParts = url2.split("/");
        let fileNameParts = url2.split("/")[urlParts.length - 1].split(".")[0].split("_");
        let gid = fileNameParts[fileNameParts.length - 1];

        overlayInsert += `
            <div align="left" class="panel-heading">
              <b>` + clojuredKey + '(' + fileCounter + ')' + `</b>
            </div>
            <div class="panel-body">
              <div>
                <a href="${config.frontend.host}/graph/${modelPath}/leakage_from_${gid}" target="_blank">View graph</a>
              </div>
            </div>`;

        if (fileCounter == legendObject[clojuredKey].length - 1) {
          var overlayHtml = $(`
                <div class="code-dialog" id="` + clojuredKey + `-analysis-results">
                  <div class="panel panel-default">`+ overlayInsert + `</div></div>`
          );
          let nameWithSimplificationTarget = clojuredKey + (simplificationTarget ? `(${simplificationTarget})` : '');
          Analyser.onAnalysisCompleted.emit({ node: { id: "Output" + clojuredKey + fileCounter, name: nameWithSimplificationTarget}, overlayHtml: overlayHtml });
        }

        return overlayInsert;
      });
  };

}