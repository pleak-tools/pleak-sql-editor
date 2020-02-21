// import { Analyser } from "../analyser/SQLDFlowAnalizer";
var pg_parser = require("exports-loader?Module!pgparser/pg_query.js")
import { Analyser } from '../analyser/SQLDFlowAnalizer';
import { HttpClient } from '@angular/common/http';

declare var $: any;
declare var require: any;
const config = require('./../../config.json');

export class LeaksWhenRequests {

  public static sendSqlCleanRequest(http: HttpClient, diagramId, petri, matcher, taskDtoOrdering, intermediates, schemas, queries, tableDatas, attackerSettings, callback){
    const apiURL = config.leakswhen.host + config.leakswhen.adapt;

    // console.log(schemas);
    // console.log(queries);
    return http.post(apiURL, { diagram_id: diagramId, sql_script: (schemas.join('\n') + '\n' + queries.join('\n')), target: "capacities_1" })
      .toPromise()
      .then(
        (res: any) => {
          let clean_sql = res.clean_sql;
          callback(clean_sql);
          return true;
        },
        err => {
          $('#leaksWhenServerError').show();
          $('#analysis-results-panel').hide();
          $('.analysis-spinner').hide();
          return true;
        });
  }

  public static sendPropagationRequest(http: HttpClient, diagramId, petri, matcher, taskDtoOrdering, intermediates, schemas, queries, tableDatas, attackerSettings, cleanSql, callback) {
    let apiURL = config.backend.host + '/rest/sql-privacy/propagate';
    let petriURL = config.leakswhen.host + config.leakswhen.compute;

    return http.post(petriURL, { diagram_id: diagramId, petri: petri })
      .toPromise()
      .then(
        (res: any) => {
          let runs = res.runs;

          runs = runs.filter(run => {
            return run.reduce((acc, cur) => { return acc || cur.includes('EndEvent') }, false);
          });

          return runs.reduce((acc, run, runNumber) => acc.then(res => {
            let sqlCommands = run.map((id) => matcher[id]).filter(x => !!x);

            return http.post(apiURL, { modelName: "testus2", 
              intermediates: intermediates.map(arr => [arr[0].split(" ").map(word => word.toLowerCase()).join("_"), arr[1]]),//["port_2", "aggr_count_1", "aggr_count_2"], 
              allQueries: sqlCommands,
              // [
              //   "create table port_1 ( port_id INT8 primary key, name TEXT, latitude INT8, longitude INT8, offloadcapacity INT8, offloadtime INT8, harbordepth INT8, available Bool);",
              //   "create table ship_2 ( ship_id INT8 primary key, name TEXT, cargo INT8, latitude INT8, longitude INT8, length INT8, draft INT8, max_speed INT8);",
              //   "CREATE TABLE parameters ( param_id INT8 PRIMARY KEY, deadline INT8, portname TEXT);",
              //   "select p1.port_id as port_id, p1.name as name, p1.latitude as latitude, p1.longitude as longitude, p1.offloadcapacity as offloadcapacity, p1.offloadtime as offloadtime, p1.harbordepth as harbordepth, p1.available as available into port_2 from port_1 as p1;",
              //   "create or replace function aggr_count(portname TEXT) returns TABLE(cnt INT8) as $$ select count(ship_2.ship_id) as cnt from ship_2, port_2, parameters where port_2.name = parameters.portname 	AND (point(ship_2.latitude, ship_2.longitude) <@> point(port_2.latitude, port_2.longitude)) / ship_2.max_speed <= parameters.deadline $$ language SQL IMMUTABLE returns NULL on NULL INPUT; select p.name as name, res.cnt as cnt into aggr_count_2 from port_2 as p cross join aggr_count(p.name) as res;",
              //   // "create or replace function aggr_cargo(portname TEXT) returns TABLE(sumcargo INT8) as $$ select sum(ship_2.cargo) as sumcargo from ship_2, port_2, parameters where port_2.name = parameters.portname 	AND (point(ship_2.latitude, ship_2.longitude) <@> point(port_2.latitude, port_2.longitude)) / ship_2.max_speed <= parameters.deadline $$ language SQL IMMUTABLE returns NULL on NULL INPUT; select p.name as name, res.sumcargo as sumcargo into aggr_cargo_2 from port_2 as p cross join aggr_cargo(p.name) as res;",
              //   "select ac2.name as name, ac2.cnt as cnt into aggr_count_1 from aggr_count_2 as ac2;"
              // ], 
              numberOfQueries: queries.length, schemas: schemas.join('\n'), 
              queries: queries.join('\n'), 
              children: tableDatas,
              cleanSql: cleanSql, 
              attackerSettings: attackerSettings.join('\n'),
              errorUB: 0.9,
              sigmoidBeta: 0.01,
              sigmoidPrecision: 5.0,
              dateStyle: "European" })
              .toPromise()
              .then(
                (res: any) => {
                  callback(res);
                  return true;
                },
                err => {
                  $('#leaksWhenServerError').show();
                  $('#analysis-results-panel').hide();
                  $('.analysis-spinner').hide();
                  return true;
                });
          }), Promise.resolve());
        });
  }

  public static sendGARequest(http: HttpClient, schemas, queries, tableDatas, policy, attackerSettings, attackerAdvantage, callback) {
    let apiURL = config.backend.host + '/rest/sql-privacy/analyze-guessing-advantage';
    let sensitiveAttributes = LeaksWhenRequests.analyzeGA(policy);

    return http.post(apiURL, { modelName: "testus2", numberOfQueries: queries.length,
    errorUB: 0.9,
    sigmoidBeta: 0.01,
    sigmoidPrecision: 5.0,
    dateStyle: "European",
    schemas: schemas.join('\n'), queries: queries.join('\n'), children: tableDatas, sensitiveAttributes: sensitiveAttributes, attackerSettings: attackerSettings.join('\n'), epsilon: attackerAdvantage })
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

    // return http.post(apiURL, { schema: schemas, queries: queries, tableDatas: tableDatas, policy: policy, attackerSettings: attackerSettings, attackerAdvantage: attackerAdvantage })
    //   .toPromise()
    //   .then(
    //     res => {
    //       callback(res.json().result);
    //       return true;
    //     },
    //     err => {
    //       $('#leaksWhenServerError').show();
    //       $('#analysis-results-panel').hide();
    //       $('.analysis-spinner').hide();
    //       return true;
    //     });
  }

  static analyzeGA (policies) {
      for(let i = 0; i < policies.length; i++) {
        let splitGrants = policies[i].toLowerCase().split('grant');
        let withoutEmptyLine = splitGrants.slice(1, splitGrants.length).map(x => `grant${x}`);

        if(splitGrants.length > 2) {
          policies.splice(i, 1, ...withoutEmptyLine);
        }
      }

      let aggrPolicies = policies.join('\n');
      let policyResult = pg_parser.parse(aggrPolicies);

      let sensitivities = [];
      for(let i = 0; i < policyResult.parse_tree.length; i++) {
        let tableSensitivities =  LeaksWhenRequests.extractSensitivityAttributes(policyResult.parse_tree[i], policies[i]);
        sensitivities = sensitivities.concat(tableSensitivities);
      }
      
      let sensitivityInput = `leak\n${sensitivities.join('\n')}\ncost\n100`;
      return sensitivityInput;
  }

  static extractSensitivityAttributes(policyResult, inputGrantStmt) {
    let ptrn = / approx /g;
    var match;
    let allMatches = [];
    while ((match = ptrn.exec(inputGrantStmt)) != null) {
      let symbolNumber = match.index;
      let allLinesBefore = inputGrantStmt.substring(0, symbolNumber);
      let linesNumber = allLinesBefore.split('\n').length;
      let approxValue = parseInt(inputGrantStmt.substring(symbolNumber + 8, inputGrantStmt.length));
      let resp = `${policyResult.GrantStmt.objects[0].RangeVar.relname}.${policyResult.GrantStmt.privileges[0].AccessPriv.cols[linesNumber - 1].String.str} approx ${approxValue};`;
      allMatches.push(resp);
    }

    return allMatches;
  }

  public static sendPreparationRequest(http: HttpClient, diagramId, petri, matcher, selectedDataObjects, taskDtoOrdering, participants, simplificationTarget, promiseChain) {
    let apiURL = config.leakswhen.host + config.leakswhen.compute;

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
