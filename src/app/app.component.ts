import { Component, OnInit } from '@angular/core';
import { AuthService } from "app/auth/auth.service";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit{

  constructor(private authService: AuthService) {
    this.authService.authStatus.subscribe(status => {
      this.authenticated = status;
    });
  }

  private authenticated: Boolean;

  isAuthenticated() {
    return this.authenticated;
  }

  setUserEmail(value: String) {
    this.authService.setLoginCredentialsEmail(value);
  }

  setUserPassword(value: String) {
    this.authService.setLoginCredentialsPassword(value);
  }

  login() {
    this.authService.login();
  }

  logout() {
    this.authService.logout();
  }

  ngOnInit() {
    window.addEventListener('storage', (e) => {
      if (e.storageArea === localStorage) {
        this.authService.verifyToken();
      }
    });
  }

}
