
document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');
  const submitBtn = document.getElementById('submit-btn');
  const loadingIndicator = document.getElementById('loading-indicator');
  const searchResultsSummary = document.getElementById('search-results-summary');
  const vehiclesListContainer = document.getElementById('vehicles-list-container');

  const API_BASE_URL = '/api';

  // --- RENDER FUNCTION ---
  // Helper to render vehicle gallery
  const renderGallery = (images) => {
    if (!images || images.length === 0) return '';
    
    return `
      <div class="vehicle-gallery">
        <div class="main-image-container">
          <img id="main-image" src="${images[0].high_res || images[0].full || images[0].thumbnail}" 
               alt="Vehicle main image" class="main-image">
        </div>
        <div class="thumbnails-scroll">
          ${images.map((img, idx) => `
            <div class="thumbnail" onclick="document.getElementById('main-image').src='${img.high_res || img.full || img.thumbnail}'">
              <img src="${img.thumbnail}" alt="Thumbnail ${idx + 1}">
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  // Helper to render specifications
  const renderSpecs = (v) => {
    return `
      <div class="vehicle-specs">
        <div class="specs-section">
          <h4>Información General</h4>
          <table class="specs-table">
            <tr><td>VIN:</td><td>${v.vin || 'N/A'}</td></tr>
            <tr><td>Año:</td><td>${v.year || 'N/A'}</td></tr>
            <tr><td>Marca:</td><td>${v.make || 'N/A'}</td></tr>
            <tr><td>Modelo:</td><td>${v.vehicle_model || 'N/A'}</td></tr>
            <tr><td>Trim:</td><td>${v.trim || 'N/A'}</td></tr>
            <tr><td>Procedencia:</td><td>${v.location || 'N/A'}</td></tr>
          </table>
        </div>
        
        <div class="specs-section">
          <h4>Especificaciones del Motor</h4>
          <table class="specs-table">
            <tr><td>Motor:</td><td>${v.engine || 'N/A'}</td></tr>
            <tr><td>Cilindros:</td><td>${v.cylinders || 'N/A'}</td></tr>
            <tr><td>Potencia:</td><td>${v.power || 'N/A'}</td></tr>
            <tr><td>Transmisión:</td><td>${v.transmission || 'N/A'}</td></tr>
            <tr><td>Tracción:</td><td>${v.drive || 'N/A'}</td></tr>
            <tr><td>Combustible:</td><td>${v.fuel || 'N/A'}</td></tr>
          </table>
        </div>
        
        <div class="specs-section">
          <h4>Exterior</h4>
          <table class="specs-table">
            <tr><td>Color:</td><td>${v.color || 'N/A'}</td></tr>
            <tr><td>Color Interior:</td><td>${v.interior_color || 'N/A'}</td></tr>
            <tr><td>Tipo de Vehículo:</td><td>${v.body_style || 'N/A'}</td></tr>
            <tr><td>Puertas:</td><td>${v.doors || 'N/A'}</td></tr>
            <tr><td>Kilometraje:</td><td>${v.odometer || 'N/A'}</td></tr>
          </table>
        </div>
        
        <div class="specs-section">
          <h4>Documentación y Daños</h4>
          <table class="specs-table">
            <tr><td>Tipo de Título:</td><td>${v.title_type || 'N/A'}</td></tr>
            <tr><td>Título Limpio:</td><td>${v.is_clean_title || 'No'}</td></tr>
            <tr><td>¿Tiene Llaves?:</td><td>${v.has_keys || 'N/A'}</td></tr>
            <tr><td>Estado del Motor:</td><td>${v.engine_condition || 'N/A'}</td></tr>
            <tr><td>Daño Principal:</td><td>${v.primary_damage || 'N/A'}</td></tr>
            <tr><td>Daño Secundario:</td><td>${v.secondary_damage || 'N/A'}</td></tr>
          </table>
        </div>
        
        <div class="specs-section">
          <h4>Información de Subasta</h4>
          <table class="specs-table">
            <tr><td>Número de Lote:</td><td>${v.lot_number || 'N/A'}</td></tr>
            <tr><td>Oferta Actual:</td><td>${v.current_bid || 'N/A'}</td></tr>
            <tr><td>Compra Ahora:</td><td>${v.buy_it_now_price || 'N/A'}</td></tr>
            <tr><td>Estado de Venta:</td><td>${v.sale_status || 'N/A'}</td></tr>
            <tr><td>Fecha de Subasta:</td><td>${v.auction_date ? new Date(v.auction_date).toLocaleDateString() : 'N/A'}</td></tr>
          </table>
        </div>
        
        ${v.highlights && v.highlights.length > 0 ? `
        <div class="specs-section">
          <h4>Aspectos Destacados</h4>
          <ul class="highlights-list">
            ${v.highlights.map(h => `<li>${h}</li>`).join('')}
          </ul>
        </div>
        ` : ''}
        
        ${v.engine_video && v.engine_video !== 'N/A' ? `
        <div class="specs-section">
          <h4>Video del Motor</h4>
          <video controls style="width: 100%; max-width: 400px;">
            <source src="${v.engine_video}" type="video/mp4">
            Tu navegador no soporta video HTML5.
          </video>
        </div>
        ` : ''}
      </div>
    `;
  };

  const renderVehicles = (vehicles) => {
    if (!vehicles || vehicles.length === 0) {
      vehiclesListContainer.innerHTML = '<p>No results to display. Please try a search.</p>';
      return;
    }

    const vehiclesHtml = vehicles.map(v => `
      <div class="vehicle-card-detailed">
        <div class="vehicle-card-header">
          <h3 class="vehicle-title">${v.year || 'N/A'} ${v.make || 'N/A'} ${v.vehicle_model || 'N/A'}</h3>
          <div class="quick-info">
            <span class="lot-number">Lot #${v.lot_number}</span>
            <span class="current-bid">${v.current_bid || 'N/A'}</span>
          </div>
        </div>
        
        ${renderGallery(v.images_gallery || [])}
        
        ${renderSpecs(v)}
        
        <div class="vehicle-footer">
          <a href="https://www.copart.com/lot/${v.lot_number}" target="_blank" class="btn-view-copart">
            Ver en Copart →
          </a>
        </div>
      </div>
    `).join('');

    vehiclesListContainer.innerHTML = vehiclesHtml;
  };

  // --- API FUNCTION ---
  const handleSearch = async (event) => {
    event.preventDefault();
    const formData = new FormData(searchForm);
    const params = new URLSearchParams();

    for (let [key, value] of formData.entries()) {
      if (value) params.append(key, value);
    }

    // Prepare UI
    loadingIndicator.classList.remove('hidden');
    searchResultsSummary.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Searching...';
    vehiclesListContainer.innerHTML = '';
    document.getElementById('log-container').innerHTML = '';

    // Open SSE connection to receive logs
    const evtSource = new EventSource(`${API_BASE_URL}/scraper/events`);
    const appendLog = (txt, cls) => {
      const c = document.getElementById('log-container');
      const d = document.createElement('div');
      d.textContent = txt;
      if (cls) d.className = cls;
      c.appendChild(d);
      c.scrollTop = c.scrollHeight;
    };

    evtSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.level === 'info') appendLog(`ℹ️ ${payload.msg}`,'info');
        else if (payload.level === 'error') appendLog(`❌ ${payload.msg}`,'error');
        else if (payload.level === 'done') {
          appendLog(`✅ Done. ${payload.count} items.`, 'done');
          if (payload.results && Array.isArray(payload.results)) {
            renderVehicles(payload.results);
            searchResultsSummary.innerHTML = `<p>✅ <strong>Search Complete:</strong> Found ${payload.count} items.</p>`;
            searchResultsSummary.classList.remove('hidden');
          }
          evtSource.close();
          loadingIndicator.classList.add('hidden');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Buscar';
        } else {
          appendLog(JSON.stringify(payload));
        }
      } catch (err) {
        appendLog(e.data);
      }
    };

    evtSource.onerror = (err) => {
      appendLog('SSE connection error');
      console.error('SSE error', err);
    };

    // Start background scrape via POST
    try {
      await fetch(`${API_BASE_URL}/scraper/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
    } catch (error) {
      console.error('Start request error:', error);
      appendLog('Failed to start scrape: ' + String(error), 'error');
      evtSource.close();
      loadingIndicator.classList.add('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Buscar';
    }
  };

  // --- INITIALIZATION ---
  searchForm.addEventListener('submit', handleSearch);
  
  // Initialize the page with an empty state
  renderVehicles([]);
});
