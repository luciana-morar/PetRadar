angular.module('starter.services')
  // localStorage cu JSON (try/catch, ca sa nu pice aplicatia daca e blocat)
  .factory('Store', function($window) {
    return {
      get: function(key, fallback) { try { return JSON.parse($window.localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } },
      set: function(key, value) { try { $window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} },
      remove: function(key) { try { $window.localStorage.removeItem(key); } catch (e) {} }
    };
  });
