import { Component, Input, Output, EventEmitter } from '@angular/core';

declare var $: any;

@Component({
  selector: 'sidebar',
  templateUrl: '/sidebar.component.html',
  styleUrls: ['/sidebar.component.less']
})
export class SidebarComponent {
  @Input() canEdit: Boolean;
  @Output() save: EventEmitter<any> = new EventEmitter();

  public resultTable: Array<any> = [];
  public isShowPolicies: boolean = false;
  public analysisSteps: Array<any> = [];
  public isEditing: Boolean = false;
  public sidebarTitle: String = "Analysis results";
  public policies: Array<any> = [];
  public roles: Array<String> = [];
  public codeMirror: any;
  public elementOldValue: String = "";
  public elementBeingEdited: any;
  public canvas: any;

  init(canvas, codeMirror) {
    this.canvas = canvas;
    this.codeMirror = codeMirror;
  }

  showResults() {
    $('#messageModal').modal();
  }

  clear() {
    this.resultTable = [];
    this.analysisSteps = [];
  }

  clearPolicies() {
    this.policies = [];
    this.roles = [];
    this.isShowPolicies = false;
  }

  addPolicy() {
    this.policies.push({name: "New Policy", sqlScript: ""});
  }

  editPolicy(elem) {
    this.loadSQLScript(this.policies[this.policies.indexOf(elem)]);
  }

  removePolicy(elem) {
    this.policies.splice(this.policies.indexOf(elem), 1)
  }

  emitPoliciesAndRoles(policies, roles) {
    this.policies = policies;
    this.roles = roles;
    this.isShowPolicies = true;
  }

  closeSQLScriptPanel(element) {
    let self = this;
    if ((typeof element.sqlScript === "undefined" && self.codeMirror.getValue().length > 0) || (element.sqlScript && element.sqlScript != self.codeMirror.getValue())) {
      if (confirm('You have some unsaved changes. Would you like to revert these changes?')) {
        self.isEditing = false;
        self.elementBeingEdited = null;
        self.elementOldValue = "";
        if(element)
          self.canvas.removeMarker(element.id, 'selected');
      } else {
        self.canvas.addMarker(self.elementBeingEdited, 'selected');
        return false;
      }
    } else {
      self.isEditing = false;
      self.elementBeingEdited = null;
      self.elementOldValue = "";
      if(element && element.id)
        self.canvas.removeMarker(element.id, 'selected');
    }
  }

  loadSQLScript(element) {
    let self = this;
    let sqlQuery = element.sqlScript;

    $('.elementTitle').text(element.name);
    
    this.isEditing = true;

    $('#SaveEditing').off('click');
    $('#SaveEditing').on('click', () => self.save.emit(element));

    $('#CancelEditing').off('click');
    $('#CancelEditing').on('click', () => self.closeSQLScriptPanel(element));

    $('textarea#CodeEditor').val(sqlQuery);
    this.codeMirror.setValue(sqlQuery);
    var codeMirror2 = this.codeMirror;
    setTimeout(() => codeMirror2.refresh(), 10);
    self.elementOldValue = self.codeMirror.getValue();
  }

  emitTaskResult(result) {
    if (result.node.id == "result") {
      this.resultTable = [{
        nodeId: result.node.id,
        nodeName: result.node.name,
        overlayHtml: result.overlayHtml
      }];
    }
    else {
      // If there is already task result for this node, then we replace it with newer
      // If not, we just add new result
      let prevResultIndex = this.analysisSteps.findIndex(obj => { return obj.nodeId == result.node.id });
      if (prevResultIndex != -1) {
        this.analysisSteps.splice(0, 1, {
          nodeId: result.node.id,
          nodeName: result.node.name,
          overlayHtml: result.overlayHtml
        });
      }
      else {
        this.analysisSteps.push({
          nodeId: result.node.id,
          nodeName: result.node.name,
          overlayHtml: result.overlayHtml
        });
      }
    }
  }
}