angular.module('starter.services', [])

  .factory('PetService', function($http) {
    var API_URL = 'http://localhost:3000/api/pets';

    return {
      all: function() {
        return $http.get(API_URL).then(function(response) {
          return response.data;
        });
      },
      get: function(petId) {
        return $http.get(API_URL + '/' + petId).then(function(response) {
          return response.data;
        });
      },
      create: function(pet) {
        return $http.post(API_URL, pet).then(function(response) {
          return response.data;
        });
      },
      update: function(petId, pet) {
        return $http.put(API_URL + '/' + petId, pet).then(function(response) {
          return response.data;
        });
      },
      remove: function(petId) {
        return $http.delete(API_URL + '/' + petId).then(function(response) {
          return response.data;
        });
      }
    };
  });
