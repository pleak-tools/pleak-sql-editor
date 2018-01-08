import { Injectable } from '@angular/core';
import { Http, RequestOptions, Headers } from '@angular/http';
import * as Rx from 'rxjs/Rx';
import { Subject } from "rxjs/Subject";
import { Observable } from "rxjs/Observable";

declare var $: any;
declare function require(name:string);

var jwt_decode = require('jwt-decode');

var config = require('./../../config.json');
var backend = config.backend.host;

interface LoginCredentials {
  email: String,
  password: String
}

@Injectable()
export class AuthService {

  constructor(public http: Http) {
    this.verifyToken();
  }

  user: LoginCredentials = null;

  private loginCredentials: LoginCredentials = {
    email: '',
    password: ''
  };

  private authStatusBool: Subject<Boolean> = new Subject<boolean>();
  authStatus: Observable<Boolean> = this.authStatusBool.asObservable();

  getUserEmail() {
    return this.user.email;
  }

  setLoginCredentialsEmail(value: String) {
    this.loginCredentials.email = value;
  }

  setLoginCredentialsPassword(value: String) {
    this.loginCredentials.password = value;
  }

  authStatusChanged(status: Boolean) {
    this.authStatusBool.next(status);
  }

  loadRequestOptions() {
    var headers = new Headers();
    headers.append('JSON-Web-Token', localStorage.getItem('jwt'));
    return new RequestOptions({ headers: headers });
  }

  verifyToken() {
    this.http.get(config.backend.host + '/rest/auth', this.loadRequestOptions()).subscribe(
      success => {
        this.user = jwt_decode(localStorage.getItem('jwt'));
        this.authStatusChanged(true);
      },
      fail => {
        localStorage.removeItem('jwt');
        this.user = null;
        this.authStatusChanged(false);
        return false;
      }
    );
    return true;
  }

  verifyTokenWithCallbacks(callbacks: any) {
    this.http.get(config.backend.host + '/rest/auth', this.loadRequestOptions()).subscribe(
      success => {
        this.user = jwt_decode(localStorage.getItem('jwt'));
        this.authStatusChanged(true);
        if (callbacks) {
          callbacks.success();
        }
      },
      fail => {
        localStorage.removeItem('jwt');
        this.user = null;
        this.authStatusChanged(false);
        if (callbacks) {
          callbacks.fail();
        }
      }
    );
  }
  
  loginREST(user: LoginCredentials) {
    this.http.post(config.backend.host + '/rest/auth/login', user, this.loadRequestOptions()).subscribe(
      success => {
        if (success.status === 200) {
          var token = JSON.parse((<any>success)._body).token;
          localStorage.setItem("jwt", token);
          this.user = jwt_decode(token);
          this.authStatusChanged(true);
          this.loginSuccess();
        }
      },
      fail => {
        this.loginError(fail.status);
      }
    );
  }

  logoutREST() {
    this.http.get(config.backend.host + '/rest/auth/logout', this.loadRequestOptions()).subscribe(
      success => {
        localStorage.removeItem('jwt');
        this.user = null;
        this.authStatusChanged(false);
        this.hideLogoutLoading();
      },
      fail => {
        localStorage.removeItem('jwt');
        this.user = null;
        this.authStatusChanged(false);
        this.hideLogoutLoading();
      } 
    );
  }

  login() {
    this.showLoginLoading();
    this.loginREST(this.loginCredentials);
  }

  showLoginLoading() {
    $('#loginLoading').show();
    $('#loginForm').hide();
  };

  loginSuccess() {
    $('#loginLoading').fadeOut("slow", function() {
      $('#loginForm').trigger('reset').show();
      $('#loginForm .help-block').hide();
      $('#loginForm .form-group').removeClass('has-error');
    });
    $('#loginModal').modal('hide');
    this.loginCredentials = {
      email: '',
      password: ''
    };
  };

  loginError(code: Number) {
    $('#loginLoading').fadeOut("slow", function() {
      $('#loginForm .help-block').hide();
      $('#loginForm .form-group').addClass('has-error');
      $('#loginForm').show();
      if (code === 403 || code === 404 || code == 401) {
        $('#loginHelpCredentials').show();
      } else {
        $('#loginHelpServer').show();
      }
    });
  };

  logout() {
    this.showLogoutLoading();
    this.logoutREST();
    this.loginCredentials = {
      email: '',
      password: ''
    };
    window.location.href = config.frontend.host;
  }

  showLogoutLoading() {
    $('#logoutLoading').show();
    $('#logoutText').hide();
  };

  hideLogoutLoading() {
    $('#logoutLoading').fadeOut("slow", function() {
      $('#logoutText').show();
    });
    $('#logoutModal').modal('hide');
  };

}