// src/renderer/ui/Filters.js

/**
 * Composant pour gérer les filtres de recherche et de tri
 */
class Filters {
  constructor(store) {
    this.store = store;
    this.categoryDropdown = document.querySelector('.category-filter');
    this.genreDropdown = document.querySelector('.genre-filter');
    this.searchInput = document.querySelector('.search-input');
    this.resetButton = document.querySelector('.reset-filters');

    this.setupEventListeners();
  }

  /**
   * Configure les écouteurs d'événements
   */
  setupEventListeners() {
    // Filtre par catégorie
    if (this.categoryDropdown) {
      this.categoryDropdown.addEventListener('change', () => {
        this.store.updateFilters({
          category: this.categoryDropdown.value
        });
      });
    }

    // Filtre par genre (multi-select)
    if (this.genreDropdown) {
      this.genreDropdown.addEventListener('change', () => {
        const selectedOptions = Array.from(this.genreDropdown.selectedOptions);
        const genres = selectedOptions.map(opt => opt.value);
        this.store.updateFilters({ genres });
      });
    }

    // Recherche avec délai
    if (this.searchInput) {
      let searchTimeout;
      this.searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.store.updateFilters({
            searchTerm: this.searchInput.value
          });
        }, 300);
      });
    }

    // Réinitialisation
    if (this.resetButton) {
      this.resetButton.addEventListener('click', () => {
        this.reset();
      });
    }
  }

  /**
   * Met à jour les dropdowns avec les données actuelles
   */
  updateDropdowns() {
    this.updateCategoryDropdown();
    this.updateGenreDropdown();
  }

  /**
   * Met à jour le dropdown des catégories
   */
  updateCategoryDropdown() {
    if (!this.categoryDropdown) return;

    const categories = this.store.getAvailableCategories();
    const currentValue = this.categoryDropdown.value;

    // Préserver l'option "All"
    this.categoryDropdown.innerHTML = '<option value="all">Sort by</option>';

    // Ajouter les catégories disponibles
    categories.forEach(({ code, name }) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = name;
      this.categoryDropdown.appendChild(option);
    });

    // Restaurer la sélection si elle existe toujours
    if (currentValue && Array.from(this.categoryDropdown.options).some(opt => opt.value === currentValue)) {
      this.categoryDropdown.value = currentValue;
    }
  }

  /**
   * Met à jour le dropdown des genres
   */
  updateGenreDropdown() {
    if (!this.genreDropdown) return;

    const genres = this.store.getAvailableGenres();
    const currentSelection = Array.from(this.genreDropdown.selectedOptions).map(opt => opt.value);

    // Vider le dropdown
    this.genreDropdown.innerHTML = '';

    // Ajouter les genres disponibles
    genres.forEach(genre => {
      const option = document.createElement('option');
      option.value = genre;
      option.textContent = genre;
      this.genreDropdown.appendChild(option);
    });

    // Restaurer la sélection
    currentSelection.forEach(genre => {
      const option = Array.from(this.genreDropdown.options).find(opt => opt.value === genre);
      if (option) {
        option.selected = true;
      }
    });
  }

  /**
   * Réinitialise tous les filtres
   */
  reset() {
    // Fermer les détails du jeu
    this.store.deselectGame();

    // Réinitialiser les champs
    if (this.categoryDropdown) {
      this.categoryDropdown.value = 'all';
    }

    if (this.searchInput) {
      this.searchInput.value = '';
    }

    if (this.genreDropdown) {
      Array.from(this.genreDropdown.options).forEach(option => {
        option.selected = false;
      });
    }

    // Réinitialiser les filtres dans le store
    this.store.resetFilters();
  }
}

module.exports = Filters;
