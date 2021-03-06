/*!
 *  opentok-angular (https://github.com/aullman/OpenTok-Angular)
 *
 *  Angular module for OpenTok
 *
 *  @Author: Adam Ullman (http://github.com/aullman)
 *  @Copyright (c) 2014 Adam Ullman
 *  @License: Released under the MIT license (http://opensource.org/licenses/MIT)
 **/

if (!window.OT) throw new Error('You must include the OT library before the OT_Angular library');

var ng;
if (typeof angular === 'undefined' && typeof require !== 'undefined') {
  ng = require('angular');
} else {
  ng = angular;
}
var initLayoutContainer;
if (!window.hasOwnProperty('initLayoutContainer') && typeof require !== 'undefined') {
  initLayoutContainer = require('opentok-layout-js').initLayoutContainer;
} else {
  initLayoutContainer = window.initLayoutContainer;
}

ng.module('opentok', [])
  .factory('OT', function () {
    return OT;
  })
  .factory('OTSession', ['OT', '$rootScope',
    function (OT, $rootScope) {
      

      var OTSession = {
        streams: [],
        init: function (apiKey, sessionId, token, cb) {
          this.session = OT.initSession(apiKey, sessionId);

          this.session.off().on({
            sessionConnected: function (event) {
              $rootScope.$emit('otSessionCreated');
            },
            streamCreated: function (event) {
              $rootScope.$apply(function () {
                OTSession.streams.push(event.stream);
              });
            },
            streamDestroyed: function (event) {
              $rootScope.$apply(function () {
                OTSession.streams.splice(OTSession.streams.indexOf(event.stream), 1);
              });
            }
          });

          this.session.connect(token, function (err) {
            if (cb) cb(err, OTSession.session);
          });
          this.trigger('init');
        }
      };
      OT.$.eventing(OTSession);
      return OTSession;
    }
  ])
  .directive('otLayout', ['$window', '$parse', 'OT', 'OTSession', '$timeout',
    function ($window, $parse, OT, OTSession, $timeout) {
      return {
        restrict: 'E',
        scope: {
          props: '&'
        },
        link: function (scope, element, attrs) {
          var layout = function () {
            var props = scope.props() || {};
            var container = initLayoutContainer(element[0], props);
            container.layout();
            scope.$emit('otLayoutComplete');
          };
          scope.$watch(function () {
            return element.children().length;
          }, layout);
          $window.addEventListener('resize', layout);
          var events = ['webkitfullscreenchange', 'mozfullscreenchange', 'fullscreenchange'];
          for (var i = events.length - 1; i >= 0; i--) {
            $window.addEventListener(events[i], function (event) {
              $timeout(function () {
                layout();
              }, 200);
            });
          }
          scope.$on('otLayout', layout);
          var listenForStreamChange = function listenForStreamChange() {
            OTSession.session.on('streamPropertyChanged', function (event) {
              if (event.changedProperty === 'videoDimensions') {
                layout();
              }
            });
          };
          if (OTSession.session) listenForStreamChange();
          else OTSession.on('init', listenForStreamChange);
        }
      };
    }
  ])
  .directive('otPublisher', ['OTSession', '$rootScope',
    function (OTSession, $rootScope) {
      return {
        restrict: 'E',
        scope: {
          props: '&'
        },
        link: function (scope, element, attrs) {
          var props = scope.props() || {};
          props.width = props.width ? props.width : ng.element(element).width();
          props.height = props.height ? props.height : ng.element(element).height();
          var oldChildren = ng.element(element).children();
          scope.publisher = OT.initPublisher(attrs.apikey || OTSession.session.apiKey,
            element[0], props, function (err) {
              if (err) {
                scope.$emit('otPublisherError', err, scope.publisher);
              }
            });
          // Make transcluding work manually by putting the children back in there
          ng.element(element).append(oldChildren);
          scope.publisher.on({
            accessDenied: function () {
              scope.$emit('otAccessDenied');
            },
            accessDialogOpened: function () {
              scope.$emit('otAccessDialogOpened');
            },
            accessDialogClosed: function () {
              scope.$emit('otAccessDialogClosed');
            },
            accessAllowed: function () {
              ng.element(element).addClass('allowed');
              scope.$emit('otAccessAllowed');
            },
            loaded: function () {
              $rootScope.$broadcast('otLayout');
            },
            streamCreated: function (event) {
              scope.$emit('otStreamCreated', event);
            },
            streamDestroyed: function (event) {
              scope.$emit('otStreamDestroyed', event);
            },
            videoElementCreated: function (event) {
              event.element.addEventListener('resize', function () {
                $rootScope.$broadcast('otLayout');
              });
            }
          });
          $rootScope.$on('otToggleVideo', function (event, boolean) {
            scope.publisher.publishVideo(boolean);
          });
          $rootScope.$on('otToggleAudio', function (event, boolean) {
            scope.publisher.publishAudio(boolean);
          });
          scope.$on('$destroy', function () {
            if (OTSession.session) OTSession.session.unpublish(scope.publisher);
          });

          OTSession.session.publish(scope.publisher, function (err) {
            if (err) {
              $rootScope.$broadcast('otPublisherError', err, scope.publisher);
            }
          });
        }
      };
    }
  ])
  .directive('otSubscriber', ['OTSession', '$rootScope',
    function (OTSession, $rootScope) {
      return {
        restrict: 'E',
        scope: {
          stream: '=',
          props: '&'
        },
        link: function (scope, element) {
          var stream = scope.stream,
            props = scope.props() || {};
          props.width = props.width ? props.width : ng.element(element).width();
          props.height = props.height ? props.height : ng.element(element).height();
          var oldChildren = ng.element(element).children();
          scope.subscriber = OTSession.session.subscribe(stream, element[0], props, function (err) {
            if (err) {
              scope.$emit('otSubscriberError', err, scope.subscriber);
            }
          });
          scope.subscriber.on({
            loaded: function () {
              $rootScope.$broadcast('otLayout');
            },
            videoElementCreated: function (event) {
              event.element.addEventListener('resize', function () {
                $rootScope.$broadcast('otLayout');
              });
            },
            connected: function (event) {
              scope.$emit('otSubscriberConnected', event);
            },
            disconnected: function (event) {
              scope.$emit('otSubscriberDisconnected', event);
            }
          });
          // Make transcluding work manually by putting the children back in there
          ng.element(element).append(oldChildren);
          scope.$on('$destroy', function () {
            OTSession.session.unsubscribe(scope.subscriber);
            OTSession.streams.splice(OTSession.streams.indexOf(scope.subscriber.stream), 1);
          });
        }
      };
    }
  ]);
