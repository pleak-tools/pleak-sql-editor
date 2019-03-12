import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';

import { AppComponent } from './app.component';
import { EditorComponent } from './editor/editor.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { GAPanelComponent } from './ga-panel/ga-panel.component';
import { SanitizeHtmlPipe } from './microcode/sanitizer';
import { AuthService } from './auth/auth.service';

@NgModule({
  declarations: [
    AppComponent,
    EditorComponent,
    SidebarComponent,
    GAPanelComponent,
    SanitizeHtmlPipe
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpModule
  ],
  providers: [AuthService],
  bootstrap: [AppComponent]
})
export class AppModule { }
