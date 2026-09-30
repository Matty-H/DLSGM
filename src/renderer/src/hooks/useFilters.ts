import { useCallback, useState } from 'react';
import type { CreatorFilter } from '../lib/filterManager.js';
import { ALL_COLLECTIONS } from '../lib/collections.js';

export interface FiltersState {
  searchTerm: string;
  selectedCategoryCode: string;
  selectedGenres: string[];
  selectedRating: number;
  selectedSort: string;
  creatorFilter: CreatorFilter | null;
  collectionFilter: string;
}

/**
 * État des filtres/tri de la bibliothèque de jeux. Purement local à
 * l'interface — seul `selectedSort` est persisté (voir App.tsx, qui
 * initialise/synchronise cette valeur avec les paramètres sauvegardés).
 */
export function useFilters(initialSort: string) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryCode, setSelectedCategoryCode] = useState('all');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedRating, setSelectedRating] = useState(0);
  const [selectedSort, setSelectedSort] = useState(initialSort);
  const [creatorFilter, setCreatorFilter] = useState<CreatorFilter | null>(null);
  const [collectionFilter, setCollectionFilter] = useState(ALL_COLLECTIONS);

  const toggleGenre = useCallback((genre: string) => {
    setSelectedGenres(prev => (prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]));
  }, []);

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedCategoryCode('all');
    setSelectedGenres([]);
    setSelectedRating(0);
    setSelectedSort('name_asc');
    setCreatorFilter(null);
    setCollectionFilter(ALL_COLLECTIONS);
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    selectedCategoryCode,
    setSelectedCategoryCode,
    selectedGenres,
    setSelectedGenres,
    toggleGenre,
    selectedRating,
    setSelectedRating,
    selectedSort,
    setSelectedSort,
    creatorFilter,
    setCreatorFilter,
    collectionFilter,
    setCollectionFilter,
    resetFilters

  };
}
