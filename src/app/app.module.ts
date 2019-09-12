import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { EditorComponent } from './editor/editor.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { GAPanelComponent } from './ga-panel/ga-panel.component';
import { SanitizeHtmlPipe } from './microcode/sanitizer';
import { AuthService } from './auth/auth.service';
import { AngularMultiSelectModule } from 'angular2-multiselect-dropdown';
import { ToastrModule } from 'ngx-toastr';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

@NgModule({
  declarations: [
    AppComponent,
    EditorComponent,
    SidebarComponent,
    GAPanelComponent,
    SanitizeHtmlPipe
  ],
  imports: [
    NoopAnimationsModule,
    BrowserModule,
    FormsModule,
    AngularMultiSelectModule,
    HttpClientModule,
    ToastrModule.forRoot({
      timeOut: 5000,
      positionClass: 'toast-bottom-right',
      preventDuplicates: true,
    })
  ],
  providers: [AuthService],
  bootstrap: [AppComponent]
})
export class AppModule { }
