angular.module('starter.services')
  // logica online/offline + apelurile REST.
  // Date locale, separate pe utilizator (localStorage):
  //   pets_cache  lista de animale. Cele create/modificate offline au _pending: true;
  //               cele create offline au id "local-<timp>" (se trimit cu POST, restul cu PUT)
  //   id_aliases  {"local-123": idRealDupaSincronizare}
.factory('PetRepository', function($q, $http, $rootScope, NetworkService, AuthService, Store, API) {

  function key(name) { return name + '_' + (AuthService.userId() || 'anon'); }
  function cache() { return Store.get(key('pets_cache'), []); }
  function pending() { return cache().filter(function(p) { return p._pending; }); }
  function find(list, id) { return list.filter(function(p) { return String(p.id) === String(id); })[0]; }
  function resolve(id) { return Store.get(key('id_aliases'), {})[id] || id; }
  function isLocal(id) { return String(id).indexOf('local-') === 0; }
  function offline(response) { return response.status <= 0; }
  function changed() { $rootScope.$broadcast('pets:changed'); }
  function newest(a, b) { return String(b.id).replace('local-', '') - String(a.id).replace('local-', ''); }

  function clean(pet) {                              // ce trimitem la server
    var body = angular.copy(pet);
    delete body.id; delete body.userId; delete body._pending;
    return body;
  }

  function matches(pet, filter) {
    var q = (filter.search || '').toLowerCase().trim();
    if (filter.status && pet.status !== filter.status) { return false; }
    return !q || [pet.name, pet.species, pet.location, pet.description].join(' ').toLowerCase().indexOf(q) !== -1;
  }

  // fara raspuns in 8s, cererea pica (=> offline)
  function api(method, path, data, params) {
    return $http({ method: method, url: API.url + '/api/pets' + path, data: data, params: params, timeout: 8000 })
      .then(function(response) { return response.data; });
  }

  // ----- cache -----
  // pune un animal in cache; nu suprascrie o modificare locala netrimisa (decat cu force)
  function saveToCache(pet, force) {
    var list = cache();
    var old = find(list, pet.id);
    if (old && old._pending && !force) { return old; }
    if (old) { list[list.indexOf(old)] = pet; } else { list.push(pet); }
    Store.set(key('pets_cache'), list);
    return pet;
  }

  function dropFromCache(id) {
    Store.set(key('pets_cache'), cache().filter(function(p) { return String(p.id) !== String(id); }));
  }

  // scriere locala (offline / server inaccesibil): fara id = animal nou, altfel modificarea unuia existent
  function saveLocal(id, body) {
    var old = id && find(cache(), id);
    if (id && !old) { return $q.reject({ status: 404 }); }
    var pet = angular.extend({}, old, body, { id: old ? old.id : 'local-' + Date.now(), _pending: true });
    saveToCache(pet, true);
    changed();
    return pet;
  }

  // ----- citire (offline: aceeasi forma de raspuns, dar din cache) -----
  function page(pageNumber, limit, filter) {
    var from = (pageNumber - 1) * limit;

    function local() {
      var list = cache().filter(function(p) { return matches(p, filter); }).sort(newest);
      return { items: list.slice(from, from + limit), hasMore: from + limit < list.length };
    }

    if (!NetworkService.online) { return $q.when(local()); }

    var params = { page: pageNumber, limit: limit, search: filter.search || undefined, status: filter.status || undefined };
    return api('GET', '', null, params).then(function(result) {
      result.items = result.items.map(function(p) { return saveToCache(p); });
      if (pageNumber === 1) {                        // + cele create offline, inca netrimise
        var created = cache().filter(function(p) { return isLocal(p.id) && matches(p, filter); }).sort(newest);
        result.items = created.concat(result.items);
      }
      return result;
    }, function(response) {
      return offline(response) ? local() : $q.reject(response);
    });
  }

  function get(id) {
    id = resolve(id);
    function cached() {
      var pet = find(cache(), id);
      return pet ? $q.when(pet) : $q.reject({ status: 404 });
    }
    if (!NetworkService.online || isLocal(id)) { return cached(); }
    return api('GET', '/' + id).then(saveToCache, function(response) {
      return offline(response) ? cached() : $q.reject(response);
    });
  }

  // ----- scriere: online -> server; offline sau eroare de retea -> local, de trimis mai tarziu -----
  function save(id, pet) {                           // id gol = creare
    id = resolve(id);
    var body = clean(pet);
    if (!NetworkService.online || isLocal(id)) { return $q.when(saveLocal(id, body)); }
    return api(id ? 'PUT' : 'POST', id ? '/' + id : '', body).then(function(saved) {
      saveToCache(saved, true);
      changed();
      return saved;
    }, function(response) {
      return offline(response) ? saveLocal(id, body) : $q.reject(response);
    });
  }

  function remove(id) {                              // stergerea cere conexiune
    id = resolve(id);
    if (!NetworkService.online) { return $q.reject({ status: 0, offline: true }); }
    return api('DELETE', '/' + id).then(function(removed) {
      dropFromCache(id);
      changed();
      return removed;
    });
  }

  // ----- sincronizare: trimite modificarile netrimise, una pe rand -----
  var syncing;

  function sync() {
    if (syncing) { return syncing; }
    var todo = pending();
    if (!NetworkService.online || !todo.length) { return $q.when(); }

    syncing = todo.reduce(function(chain, item) {
      return chain.then(function() {
        var pet = find(cache(), item.id);            // versiunea cea mai noua
        if (!pet) { return; }
        var create = isLocal(pet.id);

        return (create ? api('POST', '', clean(pet)) : api('PUT', '/' + pet.id, clean(pet))).then(function(saved) {
          if (create) {
            dropFromCache(pet.id);                   // scoatem "local-..." si eventualul duplicat adus de socket
            dropFromCache(saved.id);
            var aliases = Store.get(key('id_aliases'), {});
            aliases[pet.id] = saved.id;
            Store.set(key('id_aliases'), aliases);
          }
          saveToCache(saved, true);
        }, function(response) {
          if (offline(response) || response.status === 401) { return $q.reject(response); }   // reincercam mai tarziu
          pet._pending = false;                      // eroare permanenta (ex. 404): renuntam la modificare
          saveToCache(pet, true);
        });
      });
    }, $q.when()).catch(angular.noop).finally(function() { syncing = null; changed(); });

    return syncing;
  }

  // ----- evenimente WebSocket -----
  function applyRemote(event, pet) {
    if (event === 'pet:deleted') { dropFromCache(pet.id); } else { saveToCache(pet); }
    changed();
  }

  return {
    page: page,
    get: get,
    create: function(pet) { return save(null, pet); },
    update: save,
    remove: remove,
    sync: sync,
    applyRemote: applyRemote,
    pendingCount: function() { return pending().length; }
  };
})
