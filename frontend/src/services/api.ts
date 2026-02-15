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
  PontajResponse,
} from '@/types';

const API_URL = (import.meta as any).env.VITE_API_URL || '/api';

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

  async generateEmbeddings(force = false): Promise<{ total: number; generated: number; errors: number }> {
    const { data } = await this.client.post(`/nomenclator/generate-embeddings?force=${force}`);
    return data;
  }

  async getNeasociate(): Promise<{ denumire: string; count: number }[]> {
    const { data } = await this.client.get('/nomenclator/neasociate');
    return data;
  }

  async asociazaNeasociate(denumire_custom: string, nomenclator_id: number): Promise<{ updated: number }> {
    const { data } = await this.client.post('/nomenclator/asociaza', { denumire_custom, nomenclator_id });
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

  async getAlimentari(params?: {
    exercitiu_id?: number;
    data_start?: string;
    data_end?: string;
  }): Promise<Alimentare[]> {
    const { data } = await this.client.get<Alimentare[]>('/alimentari', { params });
    return data;
  }

  async createAlimentare(alimentare: {
    portofel_id: number;
    suma: number;
    moneda?: string;
    comentarii?: string;
  }): Promise<Alimentare> {
    const { data } = await this.client.post<Alimentare>('/alimentari', alimentare);
    return data;
  }

  async updateAlimentare(id: number, alimentare: Partial<Alimentare>): Promise<Alimentare> {
    const { data } = await this.client.patch<Alimentare>(`/alimentari/${id}`, alimentare);
    return data;
  }

  async deleteAlimentare(id: number): Promise<void> {
    await this.client.delete(`/alimentari/${id}`);
  }

  // ============================================
  // TRANSFERURI
  // ============================================

  async getTransferuri(params?: {
    exercitiu_id?: number;
    data_start?: string;
    data_end?: string;
  }): Promise<Transfer[]> {
    const { data } = await this.client.get<Transfer[]>('/transferuri', { params });
    return data;
  }

  async createTransfer(transfer: {
    portofel_sursa_id: number;
    portofel_dest_id: number;
    suma: number;
    moneda?: string;
    suma_dest?: number;
    moneda_dest?: string;
    comentarii?: string;
  }): Promise<Transfer> {
    const { data } = await this.client.post<Transfer>('/transferuri', transfer);
    return data;
  }

  async updateTransfer(id: number, transfer: Partial<Transfer>): Promise<Transfer> {
    const { data } = await this.client.patch<Transfer>(`/transferuri/${id}`, transfer);
    return data;
  }

  async deleteTransfer(id: number): Promise<void> {
    await this.client.delete(`/transferuri/${id}`);
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
      params: { data_start, data_end }
    });
    return data;
  }

  async getSolduriPortofele(params?: {
    data?: string;
    exercitiu_id?: number;
  }): Promise<any[]> {
    const { data } = await this.client.get<any[]>('/portofele/solduri', { params });
    return data;
  }

  // ============================================
  // AUTOCOMPLETE
  // ============================================

  async autocompleteNomenclator(query: string): Promise<AutocompleteResult[]> {
    const { data } = await this.client.get<AutocompleteResult[]>('/autocomplete', {
      params: { q: query }
    });
    return data;
  }

  // ============================================
  // MONEDE (currencies)
  // ============================================

  async getMonede(): Promise<{ code: string; label: string }[]> {
    const { data } = await this.client.get<{ code: string; label: string }[]>('/settings/monede');
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
  // APELURI
  // ============================================

  async getApeluriPrimite(data?: string): Promise<any> {
    const params: Record<string, any> = {};
    if (data) params.data = data;
    const { data: result } = await this.client.get('/apeluri/primite', { params });
    return result;
  }

  async getApeluriTrend(days?: number): Promise<any> {
    const params: Record<string, any> = {};
    if (days) params.days = days;
    const { data: result } = await this.client.get('/apeluri/trend', { params });
    return result;
  }

  async getApeluriIstoric(params?: {
    data_start?: string;
    data_end?: string;
    limit?: number;
  }): Promise<any[]> {
    const { data: result } = await this.client.get('/apeluri/istoric', { params });
    return result;
  }

  async getApeluriIstoricDetalii(id: number): Promise<any> {
    const { data: result } = await this.client.get(`/apeluri/istoric/${id}`);
    return result;
  }

  async getApeluriTrendZilnic(days?: number): Promise<any> {
    const params: Record<string, any> = {};
    if (days) params.days = days;
    const { data: result } = await this.client.get('/apeluri/trend-zilnic', { params });
    return result;
  }

  async salveazaApeluriManual(data?: string): Promise<any> {
    const params: Record<string, any> = {};
    if (data) params.data_str = data;
    const { data: result } = await this.client.post('/apeluri/istoric/salveaza', null, { params });
    return result;
  }

  // ============================================
  // RECOMANDARI APELURI
  // ============================================

  async getRecomandariApeluri(data?: string, aiModel?: string): Promise<any> {
    const params: Record<string, any> = {};
    if (data) params.data = data;
    if (aiModel) params.ai_model = aiModel;
    const { data: result } = await this.client.get('/recomandari-apeluri', { params });
    return result;
  }

  async getRecomandariZileDisponibile(aiModel?: string): Promise<string[]> {
    const params: Record<string, any> = {};
    if (aiModel) params.ai_model = aiModel;
    const { data } = await this.client.get<string[]>('/recomandari-apeluri/zile-disponibile', { params });
    return data;
  }

  // ============================================
  // PONTAJ
  // ============================================

  async getPontaj(): Promise<PontajResponse> {
    const { data } = await this.client.get<PontajResponse>('/pontaj');
    return data;
  }

  async refreshPontaj(): Promise<PontajResponse> {
    const { data } = await this.client.post<PontajResponse>('/pontaj/refresh');
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
