import { Component, Input, Output, EventEmitter } from '@angular/core';

declare var $: any;

@Component({
  selector: 'sidebar',
  templateUrl: 'sidebar.component.html',
  styleUrls: ['sidebar.component.less']
})
export class SidebarComponent {
  @Input() canEdit: Boolean;
  @Output() save: EventEmitter<any> = new EventEmitter();

  public resultTable: Array<any> = [];
  public isShowRoles = false;
  public analysisSteps: Array<any> = [];
  public isEditing: Boolean = false;
  public sidebarTitle: String = 'Analysis results';
  public roles: Array<String> = [];
  public codeMirror: any;
  public elementOldValue: String = '';
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
    this.roles = [];
    this.isShowRoles = false;
  }

  closeSQLScriptPanel(element, type) {
    const self = this;
    const elementScript = type ? element.policyScript : element.sqlScript;

    if ((typeof elementScript === 'undefined' && self.codeMirror.getValue().length > 0) || (elementScript && elementScript != self.codeMirror.getValue())) {
      if (confirm('You have some unsaved changes. Would you like to revert these changes?')) {
        self.roles = [];
        self.isEditing = false;
        self.isShowRoles = false;
        self.elementBeingEdited = null;
        self.elementOldValue = '';
        if (element) {
          self.canvas.removeMarker(element.id, 'selected');
        }
      } else {
        self.canvas.addMarker(self.elementBeingEdited, 'selected');
        return false;
      }
    } else {
      self.isEditing = false;
      self.isShowRoles = false;
      self.roles = [];
      self.elementBeingEdited = null;
      self.elementOldValue = '';
      if (element && element.id) {
        self.canvas.removeMarker(element.id, 'selected');
      }
    }
  }

  loadSQLScript(element, type, roles = null) {
    const self = this;
    const sqlQuery = !type
      ? (element.sqlScript ? element.sqlScript : '')
      : (element.policyScript ? element.policyScript : '');

    if (type) {
      self.isShowRoles = true;
      self.roles = roles;
    } else {
      self.isShowRoles = false;
    }

    const entityLabel = (type ? 'Policy: ' : 'SQL Script: ');
    $('.elementTitle').text(entityLabel + element.name);

    this.isEditing = true;

    $('#SaveEditing').off('click');
    $('#SaveEditing').on('click', () => self.save.emit({element, type}));

    $('#CancelEditing').off('click');
    $('#CancelEditing').on('click', () => self.closeSQLScriptPanel(element, type));

    $('textarea#CodeEditor').val(sqlQuery);
    this.codeMirror.setValue(sqlQuery);
    const codeMirror2 = this.codeMirror;
    setTimeout(() => codeMirror2.refresh(), 10);
    self.elementOldValue = self.codeMirror.getValue();
  }

  emitTaskResult(result) {
    if (result.node.id === 'result') {
      this.resultTable = [{
        nodeId: result.node.id,
        nodeName: result.node.name,
        overlayHtml: result.overlayHtml
      }];
    } else {
      // If there is already task result for this node, then we replace it with newer
      // If not, we just add new result
      const prevResultIndex = this.analysisSteps.findIndex(obj => obj.nodeId === result.node.id);
      if (prevResultIndex !== -1) {
        this.analysisSteps.splice(0, 1, {
          nodeId: result.node.id,
          nodeName: result.node.name,
          overlayHtml: result.overlayHtml
        });
      } else {
        this.analysisSteps.push({
          nodeId: result.node.id,
          nodeName: result.node.name,
          overlayHtml: result.overlayHtml
        });
      }
    }
  }
}
