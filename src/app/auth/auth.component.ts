import { Component, OnInit} from '@angular/core';
import { EditorComponent } from 'app/editor/editor.component';

declare var $: any;
declare function require(name:string);

var request = require('superagent');
var jwtDecode = require('jwt-decode');
var config = require('./../../config.json');
var backend = config.backend.host;

@Component({
  selector: 'auth-component',
  templateUrl: '/auth.component.html',
  styleUrls: ['/auth.component.less']
})
export class AuthComponent implements OnInit {

  private editor;

  // Check if user is authenticated
  checkAuth() {
    var that = this;
    that.editor = new EditorComponent();
    request.get(backend + '/rest/auth')
      .set('JSON-Web-Token', that.getToken())
      .end(function(err, res) {
        if (err) {
          $('.buttons').hide();
          $('#login-container').show();
          $('#loginModal').modal();
        } else {
          that.editor.getModel();
        }
      });
  }

  getToken() {
    var token = localStorage.getItem('ngStorage-jwt');
    if (token !== null) {
      token = token.replace(/['"]+/g, '');
    }
    return token;
  };

  getDecodedToken = function() {
    return jwtDecode(this.getToken());
  };

  // Event listeners for login modal components
  ngOnInit() {

    var that = this;

    $('#loginForm').submit(function(e) {
      e.preventDefault();
      e.stopPropagation();
    });

    $('#log-in').click( function(e) {
      e.preventDefault();
      e.stopPropagation();
    });

    $('#loginModal').on('hide.bs.modal', function (e) {
      $('#loginForm').trigger('reset');
      $('#loginForm .help-block').hide();
      $('#loginForm .form-group').removeClass('has-error');
    });

    $('#loginButton').click(function() {
      $('#loginLoading').show();
      $('#loginForm').hide();

      var user = {
        'email': $('#userEmail').val(),
        'password': $('#userPassword').val()
      };

      // Login request
      request.post(backend + '/rest/auth/login/')
        .send(user)
        .set('Accept', 'application/json')
        .end(function(err, res) {

          if (!err) {

            localStorage.setItem("ngStorage-jwt", '"' + res.body.token + '"');

            if ($.isEmptyObject(that.editor.file)) {
              that.editor.getModel();
            }

            $('#loginLoading').fadeOut("slow", function() {
              $('#loginForm').trigger('reset').show();
              $('#loginForm .help-block').hide();
              $('#loginForm .form-group').removeClass('has-error');
            });
            $('#loginModal').modal('hide');

            if (that.editor.saveFailed) {
              that.editor.save();
            }

          } else {

            $('#loginLoading').fadeOut("slow", function() {
              $('#loginForm .help-block').hide();
              $('#loginForm .form-group').addClass('has-error');
              $('#loginForm').show();

              if (err.status === 403 || err.status === 404 || err.status == 401) {
                $('#loginHelpCredentials').show();
              } else {
                $('#loginHelpServer').show();
              }
            });

          }

        });
    });

    this.checkAuth();

  }

}