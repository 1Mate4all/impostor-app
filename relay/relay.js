const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const EVENTS_FILE = path.join(__dirname, 'relay-events.json');
let wss;

// Cargar eventos desde archivo
let events = new Map();
const eventTimestamps = new Map();
try {
  if (fs.existsSync(EVENTS_FILE)) {
    const data = fs.readFileSync(EVENTS_FILE, 'utf8');
    if (data && data.trim()) {
      const parsed = JSON.parse(data);
      events = new Map(Object.entries(parsed));
      events.forEach((event, id) => {
        eventTimestamps.set(id, event.created_at);
      });
      console.log(`Relay: Cargados ${events.size} eventos desde disco`);
    }
  }
} catch (e) {
  console.error('Relay: Error cargando eventos:', e.message);
  events = new Map();
}

// Guardar eventos en disco
function saveEvents() {
  try {
    const obj = Object.fromEntries(events);
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(obj, null, 2));
    console.log('Relay: Eventos guardados en disco. Total:', events.size);
  } catch (e) {
    console.error('Relay: Error guardando eventos:', e.message);
  }
}

// Guardar eventos periódicamente cada 5 segundos si hay cambios
let pendingSave = false;
setInterval(() => {
  if (pendingSave) {
    saveEvents();
    pendingSave = false;
  }
}, 5000);

// También guardar al recibir SIGINT
process.on('SIGINT', () => {
  console.log('Relay: Cerrando...');
  saveEvents();
  if (wss) {
    wss.close(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

try {
  wss = new WebSocket.Server({ host: HOST, port: parseInt(PORT) });
  console.log(`Relay Impostor iniciado en ws://${HOST}:${PORT}`);
} catch (e) {
  console.log('Relay: El relay ya está corriendo');
  process.exit(0);
}

const subscriptions = new Map();
let subscriptionCounter = 0;

const MAX_EVENTS = 100000;

wss.on('connection', (ws) => {
  console.log('Relay: Nueva conexión');
  
  const clientSubscriptions = new Map();
  ws._subscriptions = clientSubscriptions;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, data);
    } catch (e) {
      console.error('Relay: Error parseando mensaje:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('Relay: Conexión cerrada');
    if (ws._subscriptions) {
      ws._subscriptions.clear();
    }
  });

  ws.on('error', (err) => {
    console.error('Relay: Error en WebSocket:', err.message);
  });
});

function handleMessage(ws, data) {
  if (!data || !Array.isArray(data)) {
    console.log('Relay: Mensaje inválido recibido');
    return;
  }

  const [type, ...rest] = data;

  switch (type) {
    case 'EVENT':
      handleEvent(ws, rest[0]);
      break;
    case 'REQ':
      handleSubscription(ws, rest[0], rest[1]);
      break;
    case 'CLOSE':
      closeSubscription(ws, rest[0]);
      break;
    default:
      console.log('Relay: Tipo de mensaje desconocido:', type);
  }
}

function handleEvent(ws, event) {
  console.log('Relay: Recibido evento kind:', event?.kind, 'pubkey:', event?.pubkey?.slice(0, 8), 'id:', event?.id?.slice(0, 8));
  
  if (!event || !event.id || !event.pubkey || !event.sig) {
    console.log('Relay: Evento inválido - faltan campos requeridos');
    ws.send(JSON.stringify(['OK', event?.id || '', false, 'invalid: missing required fields']));
    return;
  }

  // Verificar si el evento ya existe
  if (events.has(event.id)) {
    console.log('Relay: Evento duplicado:', event.id.slice(0, 8));
    ws.send(JSON.stringify(['OK', event.id, true, 'duplicate:']));
    return;
  }

  // Guardar evento
  events.set(event.id, event);
  eventTimestamps.set(event.id, event.created_at);
  pendingSave = true;

  // Limpiar eventos antiguos si se supera el límite
  if (events.size > MAX_EVENTS) {
    const sortedEvents = [...eventTimestamps.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, Math.floor(MAX_EVENTS * 0.1));
    
    sortedEvents.forEach(([id]) => {
      events.delete(id);
      eventTimestamps.delete(id);
    });
    console.log('Relay: Limpiados eventos antiguos. Total:', events.size);
  }
  console.log('Relay: Evento guardado en memoria. Total:', events.size);
  
  // Notificar a todos los clientes suscritos
  let notifiedCount = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      const clientSubs = client._subscriptions || subscriptions;
      clientSubs.forEach((filters, subId) => {
        if (matchesFilters(event, filters.filters || filters)) {
          try {
            client.send(JSON.stringify(['EVENT', subId, event]));
            notifiedCount++;
          } catch (e) {
            console.error('Relay: Error enviando a cliente:', e.message);
          }
        }
      });
    }
  });
  console.log('Relay: Evento notificado a', notifiedCount, 'suscripciones');

  // Responder OK al cliente que envió
  try {
    ws.send(JSON.stringify(['OK', event.id, true, '']));
  } catch (e) {
    console.error('Relay: Error enviando OK:', e.message);
  }
}

function handleSubscription(ws, subId, filters) {
  // Normalizar filtros - pueden venir como objeto o array
  let normalizedFilters = filters;
  if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
    normalizedFilters = [filters];
  }
  
  console.log('Relay: Nueva suscripción', subId, 'con filtros:', JSON.stringify(normalizedFilters));
  const clientSubs = ws._subscriptions || subscriptions;
  clientSubs.set(subId, { filters: normalizedFilters || [], timestamp: Date.now() });
  
  const matchingEvents = [];
  events.forEach((event) => {
    if (matchesFilters(event, normalizedFilters)) {
      matchingEvents.push(event);
    }
  });

  console.log('Relay: Encontrados', matchingEvents.length, 'eventos para suscripción', subId);
  
  // Ordenar por fecha descendente y limitar
  matchingEvents.sort((a, b) => b.created_at - a.created_at);
  
  // Aplicar límite del filtro
  const filterLimit = (filters?.[0]?.limit) ? Math.min(filters[0].limit, 100) : 100;
  const eventsToSend = matchingEvents.slice(0, filterLimit);
  console.log('Relay: Enviando', eventsToSend.length, 'eventos (filter limit:', filterLimit, ')');
  
  eventsToSend.forEach((event) => {
    try {
      const msg = JSON.stringify(['EVENT', subId, event]);
      ws.send(msg);
    } catch (e) {
      console.error('Relay: Error enviando evento histórico:', e.message);
    }
  });

  try {
    ws.send(JSON.stringify(['EOSE', subId]));
  } catch (e) {
    console.error('Relay: Error enviando EOSE:', e.message);
  }
}

function closeSubscription(ws, subId) {
  const clientSubs = ws._subscriptions || subscriptions;
  clientSubs.delete(subId);
  console.log('Relay: Suscripción cerrada:', subId);
}

function matchesFilters(event, filters) {
  if (!filters) return true;
  
  // Normalizar a array si es un objeto
  let filterArray = filters;
  if (typeof filters === 'object' && !Array.isArray(filters)) {
    filterArray = [filters];
  }
  
  if (!Array.isArray(filterArray) || filterArray.length === 0) return true;

  // Un evento pasa si coincide con AL MENOS UN filtro
  return filterArray.some((filter) => {
    if (!filter || typeof filter !== 'object') return false;
    
    // Verificar kinds
    if (filter.kinds && Array.isArray(filter.kinds)) {
      if (!filter.kinds.includes(event.kind)) return false;
    }
    
    // Verificar authors
    if (filter.authors && Array.isArray(filter.authors)) {
      if (!filter.authors.includes(event.pubkey)) return false;
    }
    
    // Verificar since
    if (filter.since && typeof filter.since === 'number') {
      if (event.created_at < filter.since) return false;
    }
    
    // Verificar until
    if (filter.until && typeof filter.until === 'number') {
      if (event.created_at > filter.until) return false;
    }
    
    // Verificar #e tags
    if (filter['#e'] && Array.isArray(filter['#e'])) {
      if (!hasTag(event, 'e', filter['#e'])) return false;
    }
    
    // Verificar #p tags
    if (filter['#p'] && Array.isArray(filter['#p'])) {
      if (!hasTag(event, 'p', filter['#p'])) return false;
    }
    
    // Si llegó hasta aquí, el filtro pasa
    return true;
  });
}

function hasTag(event, tagName, values) {
  if (!event.tags || !Array.isArray(event.tags)) return false;
  return event.tags.some((tag) => {
    return Array.isArray(tag) && tag[0] === tagName && values.includes(tag[1]);
  });
}
