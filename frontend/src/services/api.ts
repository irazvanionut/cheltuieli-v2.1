import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  TokenResponse,
  User,
  Portofel,
  Categorie,
  Grupa,
  Nomenclator,
  AutocompleteResult,
  Exercitiu,
  Cheltuiala,
  CheltuialaCreate,
  Transfer,
  Alimentare,
  RaportZilnic,
  Setting,
  OllamaStatus,
} from '@/types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for auth
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Response interceptor for errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.token = null;
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );

    // Load token from storage
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      this.token = storedToken;
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  // ============================================
  // AUTH
  // ============================================

  async login(codAcces: string): Promise<TokenResponse> {
    const { data } = await this.client.post<TokenResponse>('/auth/login', {
      cod_acces: codAcces,
    });
    this.setToken(data.access_token);
    return data;
  }

  async getMe(): Promise<User> {
    const { data } = await this.client.get<User>('/auth/me');
    return data;
  }

  logout() {
    this.setToken(null);
  }

  // ============================================
  // USERS
  // ============================================

  async getUsers(): Promise<User[]> {
    const { data } = await this.client.get<User[]>('/auth/users');
    return data;
  }

  async createUser(user: Partial<User> & { cod_acces: string }): Promise<User> {
    const { data } = await this.client.post<User>('/auth/users', user);
    return data;
  }

  async updateUser(id: number, user: Partial<User>): Promise<User> {
    const { data } = await this.client.patch<User>(`/auth/users/${id}`, user);
    return data;
  }

  // ============================================
  // AUTOCOMPLETE & NOMENCLATOR
  // ============================================

  async autocomplete(query: string, limit = 10): Promise<AutocompleteResult[]> {
    const { data } = await this.client.get<AutocompleteResult[]>('/autocomplete', {
      params: { q: query, limit },
    });
    return data;
  }

  async getNomenclator(params?: {
    categorie_id?: number;
    grupa_id?: number;
    activ?: boolean;
  }): Promise<Nomenclator[]> {
    const { data } = await this.client.get<Nomenclator[]>('/nomenclator', { params });
    return data;
  }

  async createNomenclator(item: Partial<Nomenclator>): Promise<Nomenclator> {
    const { data } = await this.client.post<Nomenclator>('/nomenclator', item);
    return data;
  }

  async updateNomenclator(id: number, item: Partial<Nomenclator>): Promise<Nomenclator> {
    const { data } = await this.client.patch<Nomenclator>(`/nomenclator/${id}`, item);
    return data;
  }

  async generateEmbeddings(): Promise<{ total: number; generated: number; errors: number }> {
    const { data } = await this.client.post('/nomenclator/generate-embeddings');
    return data;
  }

  // ============================================
  // EXERCITII
  // ============================================

  async getExercitii(limit = 30): Promise<Exercitiu[]> {
    const { data } = await this.client.get<Exercitiu[]>('/exercitii', { params: { limit } });
    return data;
  }

  async getExercitiuCurent(): Promise<Exercitiu> {
    const { data } = await this.client.get<Exercitiu>('/exercitii/curent');
    return data;
  }

  async createExercitiu(exercitiu?: Partial<Exercitiu>): Promise<Exercitiu> {
    const { data } = await this.client.post<Exercitiu>('/exercitii', exercitiu || {});
    return data;
  }

  async inchideExercitiu(observatii?: string): Promise<Exercitiu> {
    const { data } = await this.client.post<Exercitiu>('/exercitii/inchide', { observatii });
    return data;
  }

  // ============================================
  // CHELTUIELI
  // ============================================

  async getCheltuieli(params?: {
    exercitiu_id?: number;
    data_start?: string;
    data_end?: string;
    portofel_id?: number;
    categorie_id?: number;
    verificat?: boolean;
    neplatit?: boolean;
  }): Promise<Cheltuiala[]> {
    const { data } = await this.client.get<Cheltuiala[]>('/cheltuieli', { params });
    return data;
  }

  async createCheltuiala(cheltuiala: CheltuialaCreate): Promise<Cheltuiala> {
    const { data } = await this.client.post<Cheltuiala>('/cheltuieli', cheltuiala);
    return data;
  }

  async updateCheltuiala(id: number, cheltuiala: Partial<Cheltuiala>): Promise<Cheltuiala> {
    const { data } = await this.client.patch<Cheltuiala>(`/cheltuieli/${id}`, cheltuiala);
    return data;
  }

  async deleteCheltuiala(id: number): Promise<void> {
    await this.client.delete(`/cheltuieli/${id}`);
  }

  async verificaCheltuiala(id: number): Promise<Cheltuiala> {
    const { data } = await this.client.post<Cheltuiala>(`/cheltuieli/${id}/verifica`);
    return data;
  }

  async bulkVerifica(ids: number[]): Promise<{ verified: number }> {
    const { data } = await this.client.post('/cheltuieli/bulk-verifica', ids);
    return data;
  }

  // ============================================
  // PORTOFELE
  // ============================================

  async getPortofele(activ?: boolean): Promise<Portofel[]> {
    const params: Record<string, any> = {};
    if (activ !== undefined) params.activ = activ;
    const { data } = await this.client.get<Portofel[]>('/portofele', { params });
    return data;
  }

  async getSolduriPortofele(exercitiu_id?: number): Promise<Portofel[]> {
    const { data } = await this.client.get<Portofel[]>('/portofele/solduri', {
      params: { exercitiu_id },
    });
    return data;
  }

  async createPortofel(portofel: Partial<Portofel>): Promise<Portofel> {
    const { data } = await this.client.post<Portofel>('/portofele', portofel);
    return data;
  }

  async updatePortofel(id: number, portofel: Partial<Portofel>): Promise<Portofel> {
    const { data } = await this.client.patch<Portofel>(`/portofele/${id}`, portofel);
    return data;
  }

  // ============================================
  // ALIMENTARI
  // ============================================

  async getAlimentari(exercitiu_id?: number): Promise<Alimentare[]> {
    const { data } = await this.client.get<Alimentare[]>('/alimentari', {
      params: { exercitiu_id },
    });
    return data;
  }

  async createAlimentare(alimentare: {
    portofel_id: number;
    suma: number;
    comentarii?: string;
  }): Promise<Alimentare> {
    const { data } = await this.client.post<Alimentare>('/alimentari', alimentare);
    return data;
  }

  // ============================================
  // TRANSFERURI
  // ============================================

  async getTransferuri(exercitiu_id?: number): Promise<Transfer[]> {
    const { data } = await this.client.get<Transfer[]>('/transferuri', {
      params: { exercitiu_id },
    });
    return data;
  }

  async createTransfer(transfer: {
    portofel_sursa_id: number;
    portofel_dest_id: number;
    suma: number;
    comentarii?: string;
  }): Promise<Transfer> {
    const { data } = await this.client.post<Transfer>('/transferuri', transfer);
    return data;
  }

  // ============================================
  // RAPOARTE
  // ============================================

  async getRaportZilnic(params?: {
    exercitiu_id?: number;
    data_raport?: string;
  }): Promise<RaportZilnic> {
    const { data } = await this.client.get<RaportZilnic>('/rapoarte/zilnic', { params });
    return data;
  }

  async getRaportPerioada(data_start: string, data_end: string): Promise<RaportZilnic[]> {
    const { data } = await this.client.get<RaportZilnic[]>('/rapoarte/perioada', {
      params: { data_start, data_end },
    });
    return data;
  }

  // ============================================
  // SETTINGS
  // ============================================

  async getSettings(): Promise<Setting[]> {
    const { data } = await this.client.get<Setting[]>('/settings');
    return data;
  }

  async updateSetting(cheie: string, valoare: string): Promise<Setting> {
    const { data } = await this.client.patch<Setting>(`/settings/${cheie}`, { valoare });
    return data;
  }

  async testOllamaConnection(): Promise<OllamaStatus> {
    const { data } = await this.client.get<OllamaStatus>('/settings/ollama/test');
    return data;
  }

  // ============================================
  // CATEGORII
  // ============================================

  async getCategorii(activ?: boolean): Promise<Categorie[]> {
    const params: Record<string, any> = {};
    if (activ !== undefined) params.activ = activ;
    const { data } = await this.client.get<Categorie[]>('/categorii', { params });
    return data;
  }

  async createCategorie(categorie: Partial<Categorie>): Promise<Categorie> {
    const { data } = await this.client.post<Categorie>('/categorii', categorie);
    return data;
  }

  async updateCategorie(id: number, categorie: Partial<Categorie>): Promise<Categorie> {
    const { data } = await this.client.patch<Categorie>(`/categorii/${id}`, categorie);
    return data;
  }

  // ============================================
  // GRUPE
  // ============================================

  async getGrupe(params?: { categorie_id?: number; activ?: boolean }): Promise<Grupa[]> {
    const { data } = await this.client.get<Grupa[]>('/grupe', { params });
    return data;
  }

  async createGrupa(grupa: Partial<Grupa>): Promise<Grupa> {
    const { data } = await this.client.post<Grupa>('/grupe', grupa);
    return data;
  }

  async updateGrupa(id: number, grupa: Partial<Grupa>): Promise<Grupa> {
    const { data } = await this.client.patch<Grupa>(`/grupe/${id}`, grupa);
    return data;
  }

  // ============================================
  // CHAT AI
  // ============================================

  async chat(message: string): Promise<{ response: string }> {
    const { data } = await this.client.post('/chat', { message });
    return data;
  }
}

export const api = new ApiService();
export default api;
