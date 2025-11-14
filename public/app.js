/**
 * ScraptPress Frontend - Búsqueda de Vehículos
 * Sistema de batching inteligente (100 vehículos por batch)
 * Paginación (10 vehículos por página)
 * Prefetch automático
 */

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

let currentVehicles = [];          // Vehículos de la página actual
let currentPage = 1;               // Página actual
const itemsPerPage = 10;           // Vehículos por página (frontend)
let totalPages = 1;                // Total de páginas calculadas
let currentQuery = '';             // Última búsqueda realizada
let batchInfo = null;              // Info del batch actual
let prefetchInProgress = false;    // Si hay prefetch en curso
let allCachedVehicles = {};        // Cache local: lotNumber -> vehicle

// Configuración de API
const API_BASE = '';               // Mismo dominio
const API_KEY = '0d2366db7108a67dcc49e309128808f566c092cb9afa8fc789b33b92ee0a863e';

// Logger simple para desarrollo
const Logger = {
  info: (section, message, data = null) => {
    const timestamp = new Date().toISOString().split('T')[1].split('Z')[0];
    const prefix = `[${timestamp}] [${section}]`;
    if (data) {
      console.log(`%c${prefix} ℹ️  ${message}`, 'color: #0066cc; font-weight: bold', data);
    } else {
      console.log(`%c${prefix} ℹ️  ${message}`, 'color: #0066cc; font-weight: bold');
    }
  },
  success: (section, message, data = null) => {
    const timestamp = new Date().toISOString().split('T')[1].split('Z')[0];
    const prefix = `[${timestamp}] [${section}]`;
    if (data) {
      console.log(`%c${prefix} ✅ ${message}`, 'color: #00aa00; font-weight: bold', data);
    } else {
      console.log(`%c${prefix} ✅ ${message}`, 'color: #00aa00; font-weight: bold');
    }
  },
  warn: (section, message, data = null) => {
    const timestamp = new Date().toISOString().split('T')[1].split('Z')[0];
    const prefix = `[${timestamp}] [${section}]`;
    if (data) {
      console.warn(`%c${prefix} ⚠️  ${message}`, 'color: #ff9900; font-weight: bold', data);
    } else {
      console.warn(`%c${prefix} ⚠️  ${message}`, 'color: #ff9900; font-weight: bold');
    }
  },
  error: (section, message, data = null) => {
    const timestamp = new Date().toISOString().split('T')[1].split('Z')[0];
    const prefix = `[${timestamp}] [${section}]`;
    if (data) {
      console.error(`%c${prefix} ❌ ${message}`, 'color: #ff0000; font-weight: bold', data);
    } else {
      console.error(`%c${prefix} ❌ ${message}`, 'color: #ff0000; font-weight: bold');
    }
  }
};

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  Logger.info('INIT', 'Inicializando ScraptPress Frontend');
  initializeEventListeners();
});

function initializeEventListeners() {
  const form = document.getElementById('search-form');
  form.addEventListener('submit', handleSearch);
  
  // Botones de paginación
  document.getElementById('first-page-btn')?.addEventListener('click', goToFirstPage);
  document.getElementById('prev-page-btn')?.addEventListener('click', previousPage);
  document.getElementById('next-page-btn')?.addEventListener('click', nextPage);
  document.getElementById('last-page-btn')?.addEventListener('click', goToLastPage);
  
  Logger.info('INIT', 'Event listeners configurados');
}

// ============================================================================
// BÚSQUEDA
// ============================================================================

async function handleSearch(event) {
  event.preventDefault();
  
  const query = document.getElementById('query').value.trim();
  
  if (!query) {
    Logger.warn('SEARCH', 'Búsqueda vacía');
    showError('Por favor ingresa un término de búsqueda');
    return;
  }
  
  Logger.info('SEARCH', `Nueva búsqueda iniciada`, { query });
  
  // Reset estado
  currentPage = 1;
  currentQuery = query;
  currentVehicles = [];
  allCachedVehicles = {};
  batchInfo = null;
  
  await fetchPage(currentPage);
}

// ============================================================================
// FETCH - Obtener página
// ============================================================================

async function fetchPage(page) {
  showLoading(true);
  hideError();
  
  Logger.info('FETCH', `Solicitando página ${page}`, { query: currentQuery });
  
  try {
    const url = new URL(`${API_BASE}/api/search/intelligent`, window.location.origin);
    url.searchParams.append('query', currentQuery);
    url.searchParams.append('page', page);
    
    Logger.info('FETCH', `Enviando GET request`, { url: url.toString() });
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Log response
    Logger.success('FETCH', 'Respuesta recibida correctamente', {
      success: data.success,
      source: data.source,
      cached: data.cached,
      returned: data.returned,
      batch: {
        number: data.batch?.number,
        totalInBatch: data.batch?.totalInBatch,
        pageWithinBatch: data.batch?.pageWithinBatch,
        pagesInBatch: data.batch?.pagesInBatch
      }
    });
    
    if (data.success && data.vehicles && data.vehicles.length > 0) {
      // Actualizar página actual
      currentVehicles = data.vehicles;
      currentPage = page;
      batchInfo = data.batch;
      
      // Guardar vehículos en cache
      data.vehicles.forEach(vehicle => {
        allCachedVehicles[vehicle.lot_number] = vehicle;
      });
      
      Logger.info('FETCH', `Vehículos guardados en cache`, {
        vehiculosNuevos: data.vehicles.length,
        totalEnCache: Object.keys(allCachedVehicles).length
      });
      
      // Calcular total de páginas si tenemos info de batch
      if (batchInfo && batchInfo.pagesInBatch) {
        // Calcular páginas totales estimadas: (batch actual + 1) * 10
        // Por ejemplo: Batch 0 tiene páginas 1-10, Batch 1 tiene 11-20, etc.
        totalPages = (batchInfo.number + 1) * batchInfo.pagesInBatch;
        
        Logger.info('FETCH', 'Info del Batch calculada', {
          batchNumber: batchInfo.number,
          totalInBatch: batchInfo.totalInBatch,
          pageWithinBatch: batchInfo.pageWithinBatch,
          pagesInBatch: batchInfo.pagesInBatch,
          estimatedTotalPages: totalPages
        });
      }
      
      // Mostrar resultados
      displayResults();
      updatePaginationControls();
      
      // Auto-prefetch si se recomienda
      if (data.prefetch?.recommended && !prefetchInProgress) {
        Logger.info('PREFETCH', 'Prefetch recomendado, iniciando carga de siguiente batch', { nextPage: page + 10 });
        triggerPrefetch(currentQuery, page + 10);
      }
    } else if (page === 1) {
      Logger.warn('FETCH', 'Sin resultados para esta búsqueda', { query: currentQuery });
      showError('No se encontraron vehículos para esta búsqueda');
      hidePaginationControls();
    } else {
      Logger.warn('FETCH', 'Sin más resultados disponibles', { page });
      showError('No hay más resultados disponibles');
      totalPages = page - 1;
      updatePaginationControls();
    }
    
  } catch (error) {
    Logger.error('FETCH', 'Error en la búsqueda', { error: error.message });
    showError('Error al realizar la búsqueda: ' + error.message);
    hidePaginationControls();
  } finally {
    showLoading(false);
  }
}

// ============================================================================
// PREFETCH - Carga anticipada en background
// ============================================================================

async function triggerPrefetch(query, page) {
  if (prefetchInProgress) {
    Logger.info('PREFETCH', 'Prefetch ya en progreso, ignorando solicitud');
    return;
  }
  
  prefetchInProgress = true;
  const banner = document.getElementById('prefetch-status');
  banner.classList.remove('hidden');
  
  Logger.info('PREFETCH', `Iniciando carga en background`, { query, page });
  
  try {
    const url = new URL(`${API_BASE}/api/search/intelligent`);
    url.searchParams.append('query', query);
    url.searchParams.append('page', page.toString());
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.vehicles) {
      // Guardar en cache
      data.vehicles.forEach(vehicle => {
        allCachedVehicles[vehicle.lot_number] = vehicle;
      });
      
      Logger.success('PREFETCH', 'Batch cargado exitosamente en background', {
        vehiculosLoaded: data.vehicles.length,
        totalEnCache: Object.keys(allCachedVehicles).length
      });
    }
    
  } catch (error) {
    Logger.error('PREFETCH', 'Error durante prefetch', { error: error.message });
  } finally {
    prefetchInProgress = false;
    setTimeout(() => banner.classList.add('hidden'), 2000);
  }
}

// ============================================================================
// NAVEGACIÓN
// ============================================================================

function nextPage() {
  if (currentPage < totalPages) {
    const nextPageNum = currentPage + 1;
    Logger.info('NAV', `Navegando a siguiente página`, { from: currentPage, to: nextPageNum });
    fetchPage(nextPageNum);
    document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function previousPage() {
  if (currentPage > 1) {
    const prevPageNum = currentPage - 1;
    Logger.info('NAV', `Navegando a página anterior`, { from: currentPage, to: prevPageNum });
    fetchPage(prevPageNum);
    document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function goToFirstPage() {
  if (currentPage !== 1) {
    Logger.info('NAV', `Navegando a primera página`);
    fetchPage(1);
    document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function goToLastPage() {
  if (currentPage !== totalPages && totalPages > 0) {
    Logger.info('NAV', `Navegando a última página`, { page: totalPages });
    fetchPage(totalPages);
    document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function goToPage(pageNum) {
  if (pageNum >= 1 && pageNum <= totalPages && pageNum !== currentPage) {
    Logger.info('NAV', `Navegando a página específica`, { page: pageNum });
    fetchPage(pageNum);
    document.getElementById('results-header')?.scrollIntoView({ behavior: 'smooth' });
  }
}

// ============================================================================
// RENDERIZADO - Mostrar resultados
// ============================================================================

function displayResults() {
  const resultsHeader = document.getElementById('results-header');
  const resultsStats = document.getElementById('results-stats');
  const container = document.getElementById('vehicles-list-container');
  
  Logger.info('RENDER', `Mostrando página ${currentPage}`, {
    vehiculosEnPagina: currentVehicles.length,
    totalEnCache: Object.keys(allCachedVehicles).length,
    infoDelBatch: {
      numero: batchInfo?.number,
      paginaEnBatch: batchInfo?.currentPageInBatch,
      totalPaginasEnBatch: batchInfo?.totalPagesInBatch
    }
  });
  
  // Mostrar header
  resultsHeader.classList.remove('hidden');
  resultsStats.textContent = `Mostrando ${currentVehicles.length} de ${Object.keys(allCachedVehicles).length} vehículo(s) encontrados`;
  
  // Limpiar resultados previos
  container.innerHTML = '';
  
  // Renderizar cada vehículo
  currentVehicles.forEach((vehicle, index) => {
    const card = createVehicleCard(vehicle, index);
    container.appendChild(card);
  });
  
  Logger.success('RENDER', `Página ${currentPage} renderizada con éxito`);
}

function createVehicleCard(vehicle, index) {
  const card = document.createElement('div');
  card.className = 'vehicle-card';
  card.onclick = () => showVehicleDetail(vehicle);
  
  const imageUrl = vehicle.imageUrl || 
    (vehicle.images_gallery && vehicle.images_gallery.length > 0 
      ? vehicle.images_gallery[0].thumbnail || vehicle.images_gallery[0].full 
      : 'https://via.placeholder.com/400x300?text=No+Image');
  
  card.innerHTML = `
    <div class="vehicle-card-image">
      <img src="${imageUrl}" alt="${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}" 
           onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
      <div class="vehicle-card-badge">${vehicle.sale_status || 'N/A'}</div>
      ${vehicle.images_gallery && vehicle.images_gallery.length > 0 ? `<div class="image-count-badge">📷 ${vehicle.images_gallery.length}</div>` : ''}
    </div>
    
    <div class="vehicle-card-content">
      <h3 class="vehicle-card-title">
        ${vehicle.year || 'N/A'} ${vehicle.make || ''} ${vehicle.model || 'N/A'}
      </h3>
      
      <div class="vehicle-card-grid">
        <div class="info-item">
          <span class="info-label">Lote</span>
          <span class="info-value">#${vehicle.lot_number || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">VIN</span>
          <span class="info-value">${vehicle.vin || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Odómetro</span>
          <span class="info-value">${vehicle.odometer || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Motor</span>
          <span class="info-value">${vehicle.engine || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Color</span>
          <span class="info-value">${vehicle.exterior_color || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Ubicación</span>
          <span class="info-value">${vehicle.location || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Daño Primario</span>
          <span class="info-value damage-badge">${vehicle.primary_damage || 'N/A'}</span>
        </div>
        
        <div class="info-item">
          <span class="info-label">Título</span>
          <span class="info-value">${vehicle.title_type || 'N/A'}</span>
        </div>
      </div>
      
      <div class="vehicle-card-prices">
        <div class="price-item">
          <span class="price-label">Oferta Actual</span>
          <span class="price-value current">${vehicle.current_bid || 'N/A'}</span>
        </div>
        
        ${vehicle.buy_it_now_price && vehicle.buy_it_now_price !== 'N/A' ? `
        <div class="price-item">
          <span class="price-label">Cómpralo Ya</span>
          <span class="price-value buy-now">${vehicle.buy_it_now_price}</span>
        </div>
        ` : ''}
        
        ${vehicle.estimated_retail_value && vehicle.estimated_retail_value !== 'N/A' ? `
        <div class="price-item">
          <span class="price-label">Valor Estimado</span>
          <span class="price-value retail">${vehicle.estimated_retail_value}</span>
        </div>
        ` : ''}
      </div>
      
      ${vehicle.auction_date ? `
      <div class="auction-date">
        <span class="date-icon">📅</span>
        <span>Subasta: ${formatDate(vehicle.auction_date)}</span>
      </div>
      ` : ''}
      
      <button class="btn-view-details" onclick="event.stopPropagation(); showVehicleDetail(allCachedVehicles['${vehicle.lot_number}'])">
        Ver Detalles Completos →
      </button>
    </div>
  `;
  
  return card;
}

// ============================================================================
// MODAL - Detalles del vehículo
// ============================================================================

function showVehicleDetail(vehicle) {
  Logger.info('MODAL', 'Abriendo detalles del vehículo', { lotNumber: vehicle.lot_number });
  
  const modal = document.getElementById('vehicle-modal');
  const modalBody = document.getElementById('modal-body');
  
  const mainImage = vehicle.imageUrl || 
    (vehicle.images_gallery && vehicle.images_gallery.length > 0 
      ? vehicle.images_gallery[0].full || vehicle.images_gallery[0].thumbnail 
      : 'https://via.placeholder.com/800x600?text=No+Image');
  
  modalBody.innerHTML = `
    <div class="modal-vehicle-detail">
      <div class="detail-header">
        <h2>${vehicle.year || 'N/A'} ${vehicle.make || ''} ${vehicle.model || 'N/A'} ${vehicle.trim || ''}</h2>
        <div class="header-badges">
          <span class="badge status-badge">${vehicle.sale_status || 'N/A'}</span>
          <span class="badge lot-badge">Lote #${vehicle.lot_number || 'N/A'}</span>
        </div>
      </div>
      
      <div class="detail-gallery">
        <div class="main-image-container">
          <img id="main-detail-image" src="${mainImage}" alt="Vehicle" 
               onerror="this.src='https://via.placeholder.com/800x600?text=No+Image'">
        </div>
        
        ${vehicle.images_gallery && vehicle.images_gallery.length > 1 ? `
        <div class="thumbnails-container">
          ${vehicle.images_gallery.map((img, idx) => `
            <img src="${img.thumbnail || img.full}" 
                 class="thumbnail-img" 
                 onclick="document.getElementById('main-detail-image').src='${img.full || img.thumbnail}'"
                 onerror="this.src='https://via.placeholder.com/100x100?text=No+Image'">
          `).join('')}
        </div>
        ` : ''}
      </div>
      
      <div class="detail-prices">
        <div class="price-card current">
          <span class="price-label">Oferta Actual</span>
          <span class="price-amount">${vehicle.current_bid || 'N/A'}</span>
        </div>
      </div>
      
      ${vehicle.highlights && vehicle.highlights.length > 0 ? `
      <div class="detail-highlights">
        <h3>Características Destacadas</h3>
        <ul class="highlights-list">
          ${vehicle.highlights.map(h => `<li>✓ ${h}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
      
      <div class="detail-actions">
        ${vehicle.copart_url ? `
        <a href="${vehicle.copart_url}" target="_blank" class="btn-action primary">
          Ver en Copart →
        </a>
        ` : ''}
        <button onclick="closeModal()" class="btn-action secondary">
          Cerrar
        </button>
      </div>
    </div>
  `;
  
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('vehicle-modal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ============================================================================
// CONTROLES DE PAGINACIÓN
// ============================================================================

function updatePaginationControls() {
  const paginationControls = document.getElementById('pagination-controls');
  const prevBtn = document.getElementById('prev-page-btn');
  const nextBtn = document.getElementById('next-page-btn');
  const firstBtn = document.getElementById('first-page-btn');
  const lastBtn = document.getElementById('last-page-btn');
  const currentPageNum = document.getElementById('current-page-num');
  const totalPagesNum = document.getElementById('total-pages-num');
  const pageNumbersContainer = document.getElementById('page-numbers');
  
  if (Object.keys(allCachedVehicles).length > 0) {
    paginationControls.classList.remove('hidden');
    
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage >= totalPages;
    firstBtn.disabled = currentPage === 1;
    lastBtn.disabled = currentPage >= totalPages;
    
    currentPageNum.textContent = currentPage;
    totalPagesNum.textContent = totalPages;
    
    generatePageNumbers(pageNumbersContainer);
    
    Logger.info('PAGINATION', 'Controles actualizados', { currentPage, totalPages });
  }
}

function generatePageNumbers(container) {
  container.innerHTML = '';
  
  const maxVisiblePages = 7;
  let startPage = 1;
  let endPage = Math.min(totalPages, maxVisiblePages);
  
  if (totalPages > maxVisiblePages) {
    const halfVisible = Math.floor(maxVisiblePages / 2);
    
    if (currentPage <= halfVisible + 1) {
      endPage = maxVisiblePages - 1;
    } else if (currentPage >= totalPages - halfVisible) {
      startPage = Math.max(1, totalPages - maxVisiblePages + 2);
    } else {
      startPage = currentPage - halfVisible;
      endPage = currentPage + halfVisible;
    }
  }
  
  if (startPage > 1) {
    addPageButton(container, 1);
    if (startPage > 2) addEllipsis(container);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    addPageButton(container, i);
  }
  
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) addEllipsis(container);
    addPageButton(container, totalPages);
  }
}

function addPageButton(container, pageNum) {
  const btn = document.createElement('button');
  btn.className = 'page-number-btn';
  btn.textContent = pageNum;
  btn.addEventListener('click', () => goToPage(pageNum));
  
  if (pageNum === currentPage) {
    btn.classList.add('active');
  }
  
  container.appendChild(btn);
}

function addEllipsis(container) {
  const ellipsis = document.createElement('span');
  ellipsis.className = 'page-ellipsis';
  ellipsis.textContent = '...';
  container.appendChild(ellipsis);
}

function hidePaginationControls() {
  const paginationControls = document.getElementById('pagination-controls');
  paginationControls.classList.add('hidden');
}

// ============================================================================
// UTILIDADES UI
// ============================================================================

function showLoading(show) {
  const loadingIndicator = document.getElementById('loading-indicator');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoading = submitBtn.querySelector('.btn-loading');
  
  if (show) {
    loadingIndicator.classList.remove('hidden');
    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
  } else {
    loadingIndicator.classList.add('hidden');
    submitBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
  }
}

function showError(message) {
  const summary = document.getElementById('search-results-summary');
  summary.className = 'error';
  summary.textContent = message;
  summary.classList.remove('hidden');
  
  setTimeout(() => {
    summary.classList.add('hidden');
  }, 5000);
}

function hideError() {
  const summary = document.getElementById('search-results-summary');
  summary.classList.add('hidden');
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ============================================================================
// EVENT LISTENERS GLOBALES
// ============================================================================

document.addEventListener('click', (e) => {
  const modal = document.getElementById('vehicle-modal');
  if (e.target === modal) {
    closeModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
  }
});
