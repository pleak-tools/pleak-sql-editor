import { dataFlowAnalysis, computeSensitivitiesMatrix } from "./GraMSecAnalizer";
import { Microcode } from "../microcode/microcode";
import { Http } from '@angular/http';
import { AuthService } from "../auth/auth.service";
import { EventEmitter, Output } from "@angular/core";

declare function require(name: string);
declare var $: any;
declare var CodeMirror: any;

var pg_parser = require("exports-loader?Module!pgparser/pg_query.js")
var config = require('./../../config.json');

let is = (element, type) => element.$instanceOf(type);

var errorInModel = false;

var analyseInProgress = true;

let analyzeProcessingNode = (nodeId: string, eventBus: any, dataDefStatements: { [id: string]: string }, outputDefStatements: { [id: string]: string }, dataFlowEdges: any, invDataFlowEdges: any, registry: any, canvas: any, overlays: any, overlaysMap: any, http: Http, authService: AuthService) => {

  let node = registry.get(nodeId).businessObject;

  if (!node.sqlScript) {
    overlays.add(nodeId, { position: { bottom: 0, right: 0 }, html: '<div class="code-error">SQL script not found</div>' });
    throw new Error('No "SQLScript" attached to data processing task');
  }

  // console.log('parsing stored procedure', node.sqlScript);
  let result = pg_parser.parse(node.sqlScript);

  if (result.parse_tree.length) {

    if (result.parse_tree[0].CreateFunctionStmt) {

      let stprocBody = result.parse_tree[0].CreateFunctionStmt.options[0].DefElem.arg[0].String.str;
      let embeddedQuery = pg_parser.parse(stprocBody);

      if (embeddedQuery.parse_tree.length) {

        let numberOfColumns = 0;
        if (embeddedQuery.parse_tree[0].SelectStmt.targetList) {
          numberOfColumns = embeddedQuery.parse_tree[0].SelectStmt.targetList.length;
        }
        let numberOfParameters = result.parse_tree[0].CreateFunctionStmt.parameters.length;
        let offset = 0;
        if (numberOfColumns != 0) {
          offset = numberOfParameters - numberOfColumns;
        }
        let outputData = registry.get(dataFlowEdges[nodeId][0]).businessObject;
        let tableName = outputData.name.replace(/\s+$/, '').replace(/ *\([^)]*\) */g, "").replace(/[^\w\s]/gi, '').replace(/[\s]/gi, '_');
        var outputCreateStatement = `create table ${tableName} (`;

        for (var i = offset; i < numberOfParameters; i++) {

          var param = result.parse_tree[0].CreateFunctionStmt.parameters[i].FunctionParameter;

          if (i > offset) {
            outputCreateStatement += ', ';
          }

          outputCreateStatement += param.name + ' ' + param.argType.TypeName.names[0].String.str;
        }

        outputCreateStatement += ');';
        outputCreateStatement = outputCreateStatement.replace(/\r?\n|\r/g, '');

        let inputCreateStatements = invDataFlowEdges[nodeId].map((inputData: string) => dataDefStatements[inputData]);

        var obj_schema = [];
        for (var i = 0, len = invDataFlowEdges[nodeId].length; i < len; i++) {
          var parseTree = pg_parser.parse(dataDefStatements[invDataFlowEdges[nodeId][i]].replace(/\r?\n|\r/g, ' '));
          var tableId = invDataFlowEdges[nodeId][i];
          var script = dataDefStatements[invDataFlowEdges[nodeId][i]].replace(/\r?\n|\r/g, ' ');
          obj_schema.push({ tableId: tableId, script: script });
        }

        var obj_query = stprocBody.replace(/\r?\n|\r/g, ' ');
        analyseInProgress = true;

        let analysisHtml = `
            <div class="spinner">
              <div class="double-bounce1"></div>
              <div class="double-bounce2"></div>
            </div>`;

        $('#messageModal').find('.modal-title').text("Analysis in progress...");
        $('#messageModal').find('.modal-body').html(analysisHtml);
        $('#messageModal').modal();

        http.post(config.backend.host + '/rest/sql-privacy/analyse', { schema: obj_schema, query: obj_query }, authService.loadRequestOptions()).subscribe(
          success => {
            if (success.status === 200) {
              let res = success.json();
              errorInModel = false;
              $('#analyserInputError').hide();
              var resultRows = "";
              var matrix = {};

              for (var i = 0; i < (res.resultSet).length; i++) {
                var resultSensitivity = res.resultSet[i].sensitivity >= 0 ? res.resultSet[i].sensitivity : Infinity;
                resultRows += "<tr><td>" + registry.get(res.resultSet[i].tableId).businessObject.name + "</td><td>" + resultSensitivity + "</td><tr>";
                var inputName = res.resultSet[i].tableId;
                var outputName = outputData.id;
                var sensitivity = res.resultSet[i].sensitivity;
                matrix[inputName] = { [outputName]: sensitivity };
              }

              if (res.primaryKeysSet && res.primaryKeysSet.indexOf(1) > -1) {
                outputCreateStatement = `create table ${tableName} (`;

                for (var i = offset; i < numberOfParameters; i++) {
                  var param = result.parse_tree[0].CreateFunctionStmt.parameters[i].FunctionParameter;
                  if (i > offset) {
                    outputCreateStatement += ', ';
                  }

                  let pKey = "";
                  if (res.primaryKeysSet[i] === 1) {
                    pKey = " primary key";
                  }

                  outputCreateStatement += param.name + ' ' + param.argType.TypeName.names[0].String.str + pKey;
                }

                outputCreateStatement += ');';
                outputCreateStatement = outputCreateStatement.replace(/\r?\n|\r/g, '');
              }

              var overlayHtml = $(`
                <div class="code-dialog" id="` + nodeId + `-analysis-results">
                  <div class="panel panel-default">
                    <div align="left" class="panel-heading">
                      <b>Output SQL</b>
                    </div>
                    <div class="panel-body">
                      <textarea id="` + nodeId + `-analysis-textarea" class="hidden-code-input">${outputCreateStatement}</textarea>
                    </div>
                    <div align="left" class="panel-heading">
                      <b>Sensitivities</b>
                    </div>
                    <div class="panel-body">
                      <div class="table-responsive">
                        <table class="table table-hover">
                          <thead>
                            <tr>
                              <th>TableId</th>
                              <th>Sensitivity</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${resultRows}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>`
              );

              node.sensitivityMatrix = JSON.stringify(matrix);

              setTimeout(function () {
                let codeMirror = CodeMirror.fromTextArea(document.getElementById(nodeId + "-analysis-textarea"), {
                  mode: "text/x-mysql",
                  lineNumbers: false,
                  showCursorWhenSelecting: true,
                  lineWrapping: true,
                  readOnly: true
                });
                codeMirror.setSize("100%", 100);

                $('.panel').on('shown.bs.collapse', function (e) {
                  codeMirror.refresh();
                });
              }, 10);

              outputDefStatements[outputData.id] = outputCreateStatement;

              analyseInProgress = false;
              canvas.addMarker(nodeId, 'highlight-input');
              Analyser.onAnalysisCompleted.emit({ node: node, overlayHtml: overlayHtml });

              let element = registry.get(nodeId);
              eventBus.fire('element.click', { element: element });
            }
          },
          fail => {
            if (fail.status === 400) {
              errorInModel = true;
              $('#analyserInputError').show();
            } else {
              console.log("Server error!");
            }
          }
        );

      } else {
        overlays.add(nodeId, { position: { bottom: 0, right: 0 }, html: `<div class="code-error">${embeddedQuery.error.message}</div>` });
        throw new Error(embeddedQuery.error.message);
      }

    } else {
      overlays.add(nodeId, { position: { bottom: 0, right: 0 }, html: `<div class="code-error">Stored procedure not found</div>` });
      throw new Error('Stored procedure not found');
    }

  } else {
    setTimeout(() => {
      $('#messageModal').modal('toggle');
    }, 1000);

    Analyser.onAnalysisCompleted.emit({ node: node, overlayHtml: `<div class="code-error">${result.error.message}</div>` });
    // throw new Error(result.error.message);
  }

}

export class Analyser {
  public static analizeSQLDFlow(element: any, registry: any, canvas: any, overlays: any, eventBus: any, http: Http, authService: AuthService) {

    let info = dataFlowAnalysis(element, registry);
    let [processingNodes, dataFlowEdges, invDataFlowEdges, sources] = [info.processingNodes, info.dataFlowEdges, info.invDataFlowEdges, info.sources];
    var dataDefStatements: { [id: string]: string } = {};
    var outputDefStatements: { [id: string]: string } = {};

    for (let source of info.sources) {
      let node = registry.get(source).businessObject;

      if (!node.sqlScript) {
        overlays.add(node.id, { position: { bottom: 0, right: 0 }, html: `<div class="code-error">SQL script not found</div>` });
        throw new Error('No "SQLScript" attached to data object collection');
      }

      // console.log('parsing schema definition', node.sqlScript);
      let result = pg_parser.parse(node.sqlScript);

      if (result.parse_tree.length) {
        dataDefStatements[source] = node.sqlScript;
      } else {
        overlays.add(node.id, { position: { bottom: 0, right: 0 }, html: `<div class="code-error">${result.error.message}</div>` });
        throw new Error(result.error.message);
      }
    }

    var alreadyProcessed: Array<string> = [];
    var overlaysMap: { [id: string]: any } = {};
    var enabledNodes = processingNodes.filter((nodeId: string) => alreadyProcessed.indexOf(nodeId) < 0 && invDataFlowEdges[nodeId].every((predId: string) => dataDefStatements[predId]));

    enabledNodes.forEach((nodeId: string) => analyzeProcessingNode(nodeId, eventBus, dataDefStatements, outputDefStatements, dataFlowEdges, invDataFlowEdges, registry, canvas, overlays, overlaysMap, http, authService));

    eventBus.on('element.click', function (e: any) {

      if (is(e.element.businessObject, 'bpmn:Task') && !analyseInProgress) {
        let node = e.element.businessObject;

        if (enabledNodes.indexOf(node.id) >= 0 && !errorInModel) {
          canvas.removeMarker(node.id, 'highlight-input');

          if (overlaysMap[node.id]) {
            overlays.remove(overlaysMap[node.id]);
          }

          alreadyProcessed.push(node.id);
          let outputDataId = dataFlowEdges[node.id][0];
          dataDefStatements[outputDataId] = outputDefStatements[outputDataId];

          if (dataFlowEdges[outputDataId] && dataFlowEdges[outputDataId].length > 0) {
            var newlyEnabledNodes = dataFlowEdges[outputDataId].filter((nodeId: string) => invDataFlowEdges[nodeId].every((predId: string) => dataDefStatements[predId]));
            newlyEnabledNodes.forEach((nodeId: string) => analyzeProcessingNode(nodeId, eventBus, dataDefStatements, outputDefStatements, dataFlowEdges, invDataFlowEdges, registry, canvas, overlays, overlaysMap, http, authService));
            enabledNodes = enabledNodes.concat(newlyEnabledNodes);
          }

          enabledNodes.splice(enabledNodes.indexOf(node.id), 1);

          if (enabledNodes.length == 0) {
            let [dc, sources, targets] = computeSensitivitiesMatrix(element, registry);

            if (!$.isEmptyObject(dc)) {
              let getName = function (id: String) {
                let fullName = registry.get(id).businessObject.name;
                let shortName;
                if (fullName != null) {
                  shortName = fullName.match(/\(([^\)]+)\)/);
                }
                return shortName ? shortName[1] : fullName;
              };

              let targetsHtml = '';
              for (let target of targets) {
                targetsHtml += '<td class="inlined-matrix" style="min-width: 30px;">' + getName(target) + '</td>';
              }

              let sourcesHtml = '';
              let resultCellsIdCounter = 1;
              let cellInputOutputDict = {};

              for (let source2 of sources) {
                sourcesHtml += `<tr class="inlined-matrix">`;
                sourcesHtml += `<td class="inlined-matrix" style="min-width: 30px;">` + getName(source2) + `</td>`;
                for (let target2 of targets) {
                  cellInputOutputDict["resultCell" + resultCellsIdCounter] = {input: source2, output: target2};
                  let value = dc[source2][target2] ? dc[source2][target2] : (dc[source2][target2] === 0 ? dc[source2][target2] : '');
                  sourcesHtml += `<td id="resultCell` + resultCellsIdCounter + `" class="inlined-matrix">` + value + `</td>`;
                  resultCellsIdCounter++;
                }
                sourcesHtml += `</tr>`;
              }

              let resultTable = `
                <div>
                  <table class="inlined-matrix result-matrix">
                    <p style="font-size:16px">Sensitivity matrix:</p>
                    <tbody>
                      <tr class="inlined-matrix"> 
                        <td class="inlined-matrix"></td>
                        ` + targetsHtml + `
                      </tr>
                      ` + sourcesHtml + `
                    </tbody>
                  </table>
                </div>
              `;

              $('#messageModal').find('.modal-title').text("Results");
              $('#messageModal').find('.modal-body').html(resultTable);

              Analyser.onAnalysisCompleted.emit({ node: { id: "result", name: "Result Table" }, overlayHtml: $(resultTable) });
              overlays.remove({ element: e.element });

              // Wait until jquery rendered result table
              setTimeout(function () {
                for(let i = 1; i < resultCellsIdCounter; i++)
                  $("#resultCell" + i).on('click', (e) => {
                    let opacity = $('#messageModal').css('opacity');
                    if(opacity == 1) {
                      $('#messageModal').css('opacity', 0.6);
                      $(e.target).addClass('cell-selected');
                      canvas.addMarker(cellInputOutputDict[e.target.id].input, 'highlight-input-selected');
                      canvas.addMarker(cellInputOutputDict[e.target.id].output, 'highlight-output-selected');
                    }
                    else {
                      $('#messageModal').css('opacity', 1);
                      for(let i = 1; i < resultCellsIdCounter; i++) {
                        $("#resultCell" + i).removeClass('cell-selected');
                        canvas.removeMarker(cellInputOutputDict["resultCell" + i].input, 'highlight-input-selected');
                        canvas.removeMarker(cellInputOutputDict["resultCell" + i].output, 'highlight-output-selected');
                      }
                    }
                  });
              }, 200);
            }
          }
        }
      }
    });
  }

  @Output() static onAnalysisCompleted: EventEmitter<any> = new EventEmitter();
}