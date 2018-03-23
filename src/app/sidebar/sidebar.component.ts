import { Component, Input } from '@angular/core';

declare var $: any;

@Component({
  selector: 'sidebar',
  templateUrl: '/sidebar.component.html',
  styleUrls: ['/sidebar.component.less']
})
export class SidebarComponent {
  @Input() authenticated: Boolean;

  public resultTable: Array<any> = [];
  public analysisSteps: Array<any> = [];
  public isEditing: boolean = false;

  isAuthenticated() {
    return this.authenticated;
  }

  showResults() {
    $('#messageModal').modal();
  }

  clear() {
    this.resultTable = [];
    this.analysisSteps = [];
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