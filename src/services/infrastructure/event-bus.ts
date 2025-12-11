import EventEmitter from 'events';

const eventBus = new EventEmitter();

// Increase max listeners to avoid warnings during tests/development
eventBus.setMaxListeners(50);

export default eventBus;
