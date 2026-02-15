// ============================================
// API Types
// ============================================

export interface User {
  id: number;
  username: string;
  nume_complet: string;
  rol: 'operator' | 'sef' | 'admin';
  activ: boolean;
  ultima_autentificare?: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Portofel {
  id: number;
  nume: string;
  descriere?: string;
  ordine: number;
  activ: boolean;
  created_at: string;
  sold_total?: Record<string, number>;
  sold_zi_curenta?: Record<string, number>;
}

export interface Categorie {
  id: number;
  nume: string;
  descriere?: string;
  culoare: string;
  afecteaza_sold: boolean;
  ordine: number;
  activ: boolean;
  created_at: string;
}

export interface Grupa {
  id: number;
  nume: string;
  categorie_id?: number;
  categorie_nume?: string;
  ordine: number;
  activ: boolean;
  created_at: string;
}

export interface Nomenclator {
  id: number;
  denumire: string;
  categorie_id?: number;
  categorie_nume?: string;
  grupa_id?: number;
  grupa_nume?: string;
  tip_entitate: string;
  frecventa_utilizare: number;
  ultima_utilizare?: string;
  activ: boolean;
  created_at: string;
}

export interface AutocompleteResult {
  id?: number | null;
  denumire: string;
  categorie_id?: number;
  categorie_nume?: string;
  grupa_id?: number;
  grupa_nume?: string;
  tip_entitate?: string;
  similarity: number;
  source?: 'trigram' | 'vector';
}

export interface Exercitiu {
  id: number;
  data: string;
  ora_deschidere: string;
  ora_inchidere?: string;
  activ: boolean;
  inchis_de?: number;
  observatii?: string;
  created_at: string;
}

export interface Cheltuiala {
  id: number;
  exercitiu_id: number;
  portofel_id: number;
  nomenclator_id?: number;
  denumire_custom?: string;
  categorie_id?: number;
  grupa_id?: number;
  suma: number;
  moneda: string;
  sens: 'Cheltuiala' | 'Incasare' | 'Alimentare' | 'Transfer';
  neplatit: boolean;
  verificat: boolean;
  verificat_de?: number;
  verificat_la?: string;
  operator_id?: number;
  comentarii?: string;
  activ: boolean;
  created_at: string;
  // Joined fields
  denumire?: string;
  portofel_nume?: string;
  categorie_nume?: string;
  categorie_culoare?: string;
  grupa_nume?: string;
  operator_nume?: string;
  exercitiu_data?: string;
  exercitiu_activ?: boolean;
}

export interface CheltuialaCreate {
  portofel_id: number;
  suma: number;
  moneda?: string;
  sens?: string;
  nomenclator_id?: number;
  denumire_custom?: string;
  categorie_id?: number;
  grupa_id?: number;
  neplatit?: boolean;
  comentarii?: string;
}

export interface Transfer {
  id: number;
  exercitiu_id: number;
  portofel_sursa_id: number;
  portofel_dest_id: number;
  suma: number;
  moneda: string;
  suma_dest?: number;
  moneda_dest?: string;
  operator_id?: number;
  comentarii?: string;
  created_at: string;
  portofel_sursa_nume?: string;
  portofel_dest_nume?: string;
}

export interface Alimentare {
  id: number;
  exercitiu_id: number;
  portofel_id: number;
  suma: number;
  moneda: string;
  operator_id?: number;
  comentarii?: string;
  created_at: string;
  portofel_nume?: string;
}

// ============================================
// Report Types
// ============================================

export interface RaportCategorieItem {
  denumire: string;
  suma: number;
  moneda: string;
  neplatit: boolean;
  verificat: boolean;
  cheltuiala_id: number;
}

export interface RaportGrupa {
  grupa_id?: number;
  grupa_nume?: string;
  items: RaportCategorieItem[];
  total: Record<string, number>;
}

export interface RaportCategorie {
  categorie_id: number;
  categorie_nume: string;
  categorie_culoare: string;
  afecteaza_sold: boolean;
  grupe: RaportGrupa[];
  total_platit: Record<string, number>;
  total_neplatit: Record<string, number>;
  total: Record<string, number>;
}

export interface RaportPortofel {
  portofel_id: number;
  portofel_nume: string;
  sold: Record<string, number>;
  total_alimentari?: Record<string, number>;
  total_cheltuieli?: Record<string, number>;
  total_transferuri_in?: Record<string, number>;
  total_transferuri_out?: Record<string, number>;
}

export interface RaportZilnic {
  exercitiu_id: number;
  data: string;
  activ: boolean;
  inchis?: boolean;
  nr_cheltuieli?: number;
  nr_incasari?: number;
  total_cheltuieli: Record<string, number>;
  total_incasari?: number;
  total_alimentari?: number;
  total_neplatit: Record<string, number>;
  categorii: RaportCategorie[];
  portofele: RaportPortofel[];
  total_sold?: Record<string, number>;
}

// ============================================
// Settings Types
// ============================================

export interface Setting {
  id: number;
  cheie: string;
  valoare?: string;
  tip: string;
  descriere?: string;
  created_at: string;
  updated_at: string;
}

export interface OllamaStatus {
  status: 'connected' | 'disconnected';
  host: string;
  models?: string[];
  embedding_model?: string;
  chat_model?: string;
  error?: string;
}

// ============================================
// Chat Types
// ============================================

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  response: string;
}

// ============================================
// Pontaj Types
// ============================================

export interface PontajEmployee {
  name: string;
  clocked_in_at: string;
  clocked_in_date: string;
  position: string;
}

export interface PontajResponse {
  last_updated: string | null;
  error: string | null;
  employees: PontajEmployee[];
  positions: string[];
}

// ============================================
// Recomandari Apeluri Types
// ============================================

export interface RecomandariProdus {
  produs: string;
  cantitate: number;
  note?: string | null;
}

export interface RecomandariAnalysis {
  produse_comandate: RecomandariProdus[];
  pret_final: number | null;
  adresa_livrare: string | null;
  timp_estimat_livrare: string | null;
  scop_conversatie: string;
  comportament_vanzator: string;
  comportament_client: string;
  recomandari_training: string[];
}

export interface RecomandariConversation {
  conversation_index: number;
  transcript_preview: string;
  analysis: RecomandariAnalysis;
}

export interface RecomandariApeluri {
  id: number;
  data: string;
  total_conversatii: number;
  conversations: RecomandariConversation[];
  top_recomandari: { recomandare: string; frecventa: number }[];
  top_lucruri_bune: { comportament: string; frecventa: number }[];
  tip_apeluri: Record<string, number>;
  created_at: string;
}

// ============================================
// UI Types
// ============================================

export type Theme = 'light' | 'dark' | 'auto';

export interface AppState {
  user: User | null;
  token: string | null;
  exercitiu: Exercitiu | null;
  theme: Theme;
  isAuthenticated: boolean;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}
