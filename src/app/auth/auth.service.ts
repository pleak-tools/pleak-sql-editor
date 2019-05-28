import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';

import { BehaviorSubject } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

declare var $: any;

declare function require(name: string);

const jwt_decode = require('jwt-decode');
const config = require('../../config.json');

@Injectable()
export class AuthService {

  constructor(public http: HttpClient, private toastr: ToastrService) {
    this.verifyToken();
  }

  user = null;

  private loginCredentials = {
    email: '',
    password: ''
  };

  private authStatusBool = new BehaviorSubject<boolean|null>(null);
  authStatus = this.authStatusBool.asObservable();

  static loadRequestOptions(input: object | null = null): object {
    return Object.assign({headers: {'JSON-Web-Token': localStorage.jwt || ''}}, input);
  }

  setLoginCredentialsEmail(value: string) {
    this.loginCredentials.email = value;
  }

  setLoginCredentialsPassword(value: string) {
    this.loginCredentials.password = value;
  }

  authStatusChanged(status: boolean) {
    this.authStatusBool.next(status);
  }

  verifyToken() {

    this.http.get(config.backend.host + '/rest/auth', AuthService.loadRequestOptions()).subscribe(
        () => {
          this.user = jwt_decode(localStorage.jwt);
          this.authStatusChanged(true);
        },
        () => {
          delete localStorage.jwt;
          this.user = null;
          this.authStatusChanged(false);
          return false;
        }
    );

    return true;

  }

  loginREST(user) {

    this.http.post(config.backend.host + '/rest/auth/login', user, AuthService.loadRequestOptions({observe: 'response'})).subscribe(
        (response: HttpResponse<any>) => {

          if (response.status === 200) {

            const token = response.body.token;
            localStorage.jwt = token;
            this.user = jwt_decode(token);
            this.authStatusChanged(true);
            this.loginSuccess();

            this.toastr.success('Logged in successfully');

          }

        },
        (fail: HttpResponse<any>) => {
          this.loginError(fail.status);
        }
    );

  }

  logoutREST() {

    this.http.get(config.backend.host + '/rest/auth/logout', AuthService.loadRequestOptions()).subscribe(
        () => {
          delete localStorage.jwt;
          this.user = null;
          this.authStatusChanged(false);
          this.hideLogoutLoading();

          this.toastr.info('Logged out successfully');
        },
        () => {
          delete localStorage.jwt;
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
  }

  loginSuccess() {
    $('#loginLoading').fadeOut('slow', function () {
      $('#loginForm').trigger('reset').show();
      $('#loginForm .help-block').hide();
      $('#loginForm .form-group').removeClass('has-error');
    });
    $('#loginModal').modal('hide');
    $('body').removeClass('modal-open');
    $('.modal-backdrop').remove();
    this.loginCredentials = {
      email: '',
      password: ''
    };
  }

  loginError(code) {
    $('#loginLoading').fadeOut('slow', function () {
      $('#loginForm .help-block').hide();
      $('#loginForm .form-group').addClass('has-error');
      $('#loginForm').show();
      if (code === 403 || code === 404 || code === 401) {
        $('#loginHelpCredentials').show();
      } else {
        $('#loginHelpServer').show();
      }
    });
  }

  logout() {
    this.showLogoutLoading();
    this.logoutREST();
    this.loginCredentials = {
      email: '',
      password: ''
    };
  }

  showLogoutLoading() {
    $('#logoutLoading').show();
    $('#logoutText').hide();
  }

  hideLogoutLoading() {
    $('#logoutLoading').fadeOut('slow', function () {
      $('#logoutText').show();
    });
    $('#logoutModal').modal('hide');
    $('body').removeClass('modal-open');
    $('.modal-backdrop').remove();

    // this.router.navigateByUrl('/home');

  }

}
