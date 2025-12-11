/**
 * Copart Platform Configuration
 * Centralized configuration for Copart scraping behavior
 */

export const CopartConfig = {
  /**
   * Classic View Settings
   */
  classicView: {
    // Available page size options in Copart's classic view dropdown
    availableSizes: [5, 10, 20, 50, 100] as const,

    // Maximum items per page (Copart's limit)
    maxPageSize: 100,

    // Timeout to wait after switching to classic view (ms)
    switchTimeout: 3000,
  },

  /**
   * Scraping Behavior
   */
  scraping: {
    // Maximum items to scrape in a single request
    maxItemsPerRequest: 100,

    // Maximum items per page that AI can handle reliably (reduced from 50 to prevent truncation)
    maxAIPageSize: 20,

    // Default items to scrape if not specified
    defaultItems: 15,

    // Maximum wait time for API response (ms)
    apiResponseTimeout: 20000,

    // Poll interval when waiting for API response (ms)
    apiPollInterval: 500,
  },

  /**
   * Frontend Pagination & Prefetch Strategy
   */
  pagination: {
    // Items per page in frontend
    frontendPageSize: 10,

    // Items to scrape per backend request (1 Copart page = 100 vehicles)
    backendBatchSize: 100,

    // How many pages to prefetch ahead
    prefetchAheadPages: 5,

    /**
     * Calculate which batch is needed for a given frontend page
     * @param frontendPage - Frontend page number (1-indexed)
     * @returns Backend batch number (0-indexed)
     */
    getBatchForPage(frontendPage: number): number {
      const itemOffset = (frontendPage - 1) * this.frontendPageSize;
      return Math.floor(itemOffset / this.backendBatchSize);
    },

    /**
     * Calculate if we need to prefetch the next batch
     * @param currentPage - Current frontend page
     * @returns True if we should prefetch next batch
     */
    shouldPrefetchNextBatch(currentPage: number): boolean {
      const currentBatch = this.getBatchForPage(currentPage);
      const lastPageInBatch = ((currentBatch + 1) * this.backendBatchSize) / this.frontendPageSize;
      const pagesRemainingInBatch = lastPageInBatch - currentPage;
      return pagesRemainingInBatch <= this.prefetchAheadPages;
    },
  },

  /**
   * Selectors for DOM elements
   */
  selectors: {
    classicViewButton: [
      'button.search_result_toggle_icon.p-d-flex.p-ai-center.p-jc-center.p-mr-2',
      'button.search_result_toggle_icon',
      'search-results-view-toggle button',
      'search-results-view-toggle.search_result_toggle_view > button.search_result_toggle_icon',
    ],

    pageSizeDropdown: ['select[name="serverSideDataTable_length"]', 'select.form-control.input-sm'],
  },

  /**
   * Text patterns to identify elements
   */
  textPatterns: {
    classicViewButton: ['Vista clásica', 'Vista clasica', 'Classic View', 'Classic'],
  },

  /**
   * Get the closest valid page size from available options
   * @param requestedSize - The desired page size
   * @returns The closest valid page size that doesn't exceed requestedSize
   */
  getValidPageSize(requestedSize: number): number {
    const { availableSizes, maxPageSize } = this.classicView;

    // Clamp to max
    const clamped = Math.min(requestedSize, maxPageSize);

    // Find the largest available size that doesn't exceed the clamped value
    const validSize = [...availableSizes].reverse().find((size) => size <= clamped);

    // If no valid size found (requested < minimum), use the smallest available
    return validSize || availableSizes[0];
  },

  /**
   * Calculate how many pages are needed for the requested items
   * @param totalItems - Total items requested
   * @param pageSize - Items per page
   * @returns Number of pages needed
   */
  calculatePagesNeeded(totalItems: number, pageSize: number): number {
    return Math.ceil(totalItems / pageSize);
  },
};

// Type for available page sizes
export type CopartPageSize = (typeof CopartConfig.classicView.availableSizes)[number];
