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
  GoogleReview,
  IngestResult,
  AgendaFurnizor,
  AgendaFurnizorDetail,
  AgendaContact,
  AgendaContactCamp,
  AgendaInteractiune,
  AgendaTodo,
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

  async upsertSetting(cheie: string, valoare: string): Promise<Setting> {
    const { data } = await this.client.put<Setting>(`/settings/${cheie}`, { valoare });
    return data;
  }

  async getBearerToken(): Promise<{ value: string }> {
    const { data } = await this.client.get<{ value: string }>('/settings/bearer-token');
    return data;
  }

  async updateBearerToken(value: string): Promise<{ value: string }> {
    const { data } = await this.client.put<{ value: string }>('/settings/bearer-token', { value });
    return data;
  }

  async getFurnizori(): Promise<{
    vendors: Array<{
      name: string; businessPartnerType_: number; vatCode?: string; taxCode?: string;
      taxNumbers?: string; phoneNumber?: string; emailAddress?: string; addressText?: string;
      roleNames?: string; contactPersons?: string; createdAt_?: string; id: string;
    }>;
    count: number;
  }> {
    const { data } = await this.client.get('/furnizori');
    return data;
  }

  async resetSerpApiCounters(): Promise<{ ok: boolean; month: string }> {
    const { data } = await this.client.post<{ ok: boolean; month: string }>('/settings/serpapi/reset-counters');
    return data;
  }

  async getSerpApiAccount(refresh = false): Promise<{
    key1: { plan_name: string; account_status: string; searches_per_month: number; plan_searches_left: number; extra_credits: number; total_searches_left: number; this_month_usage: number; this_hour_searches: number; last_hour_searches: number; account_rate_limit_per_hour: number; error?: string } | null;
    key2: { plan_name: string; account_status: string; searches_per_month: number; plan_searches_left: number; extra_credits: number; total_searches_left: number; this_month_usage: number; this_hour_searches: number; last_hour_searches: number; account_rate_limit_per_hour: number; error?: string } | null;
    fetched_at: string | null;
  }> {
    const { data } = await this.client.get(`/google-reviews/serpapi-account${refresh ? '?refresh=true' : ''}`);
    return data;
  }

  async getSerpLog(limit = 100): Promise<Array<{
    ts: string; key: number; source: string; page: number;
    status: string; status_code: number; ms: number; error: string; url: string;
  }>> {
    const { data } = await this.client.get(`/google-reviews/serp-log?limit=${limit}`);
    return data;
  }

  async refetchReviewsFromDate(date: string, max_calls: number, key_mode: string, use_date: boolean = true, no_cache: boolean = true, resume_from_token: boolean = false): Promise<{
    inserted: number; skipped: number; pages_fetched: number;
    calls_per_key: Record<string, number>; from_date: string; refreshed_at: string;
    stop_reason?: string; has_next_token: boolean; exhausted: boolean;
  }> {
    const { data } = await this.client.post('/google-reviews/refetch-from-date', { date, max_calls, key_mode, use_date, no_cache, resume_from_token });
    return data;
  }

  async startRefetch(params: { date: string; max_calls: number; key_mode: string; use_date: boolean; no_cache: boolean; resume_from_token: boolean }): Promise<{ started: boolean; max_calls: number }> {
    const { data } = await this.client.post('/google-reviews/refetch-start', params);
    return data;
  }

  async getRefetchStatus(): Promise<{
    running: boolean; pages_fetched: number; inserted: number; skipped: number;
    calls_per_key: Record<string, number>; stop_reason: string | null;
    started_at: string | null; finished_at: string | null; error: string | null;
    max_calls: number; has_next_token?: boolean; exhausted?: boolean;
  }> {
    const { data } = await this.client.get('/google-reviews/refetch-status');
    return data;
  }

  async stopRefetch(): Promise<{ stopped: boolean }> {
    const { data } = await this.client.post('/google-reviews/refetch-stop');
    return data;
  }

  async getRefetchToken(): Promise<{ has_token: boolean; token: string; saved_at: string | null; exhausted: boolean }> {
    const { data } = await this.client.get('/google-reviews/refetch-token');
    return data;
  }

  async clearRefetchToken(): Promise<{ ok: boolean }> {
    const { data } = await this.client.delete('/google-reviews/refetch-token');
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

  async getApeluriLista(params?: {
    data_start?: string;
    data_end?: string;
    q?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const { data: result } = await this.client.get('/apeluri/lista', { params });
    return result;
  }

  async getApeluriAmiCanale(): Promise<any> {
    const { data: result } = await this.client.get('/apeluri/ami/canale');
    return result;
  }

  async getApeluriListaPublic(params?: {
    data_start?: string;
    data_end?: string;
    q?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const { data: result } = await this.client.get('/apeluri/lista/public', { params });
    return result;
  }

  async getApeluriAmiCanalePublic(): Promise<any> {
    const { data: result } = await this.client.get('/apeluri/ami/canale/public');
    return result;
  }

  async salveazaApeluriManual(data?: string): Promise<any> {
    const params: Record<string, any> = {};
    if (data) params.data_str = data;
    const { data: result } = await this.client.post('/apeluri/istoric/salveaza', null, { params });
    return result;
  }

  async sendSms(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
    const { data } = await this.client.post<{ ok: boolean; error?: string }>('/sms/send', { phone, message });
    return data;
  }

  async getSmsTemplates(): Promise<{ id: number; titlu: string; corp: string }[]> {
    const { data } = await this.client.get('/sms/templates');
    return data;
  }

  async createSmsTemplate(titlu: string, corp: string): Promise<{ id: number; titlu: string; corp: string }> {
    const { data } = await this.client.post('/sms/templates', { titlu, corp });
    return data;
  }

  async updateSmsTemplate(id: number, titlu: string, corp: string): Promise<{ id: number; titlu: string; corp: string }> {
    const { data } = await this.client.put(`/sms/templates/${id}`, { titlu, corp });
    return data;
  }

  async deleteSmsTemplate(id: number): Promise<{ ok: boolean }> {
    const { data } = await this.client.delete(`/sms/templates/${id}`);
    return data;
  }

  async getSmsLog(params?: { limit?: number; phone?: string }): Promise<Array<{
    id: number; phone: string; message: string; ok: boolean;
    error_msg: string | null; sent_by: string | null; created_at: string;
  }>> {
    const { data } = await this.client.get('/sms/log', { params });
    return data;
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

  // ============================================
  // GOOGLE REVIEWS
  // ============================================

  async getGoogleReviews(): Promise<GoogleReview[]> {
    const { data } = await this.client.get<GoogleReview[]>('/google-reviews');
    return data;
  }

  async getGoogleReviewsStatus(): Promise<{ last_refresh: string | null; remaining_seconds: number; cooldown_minutes: number }> {
    const { data } = await this.client.get('/google-reviews/refresh-status');
    return data;
  }

  async refreshGoogleReviews(): Promise<{ inserted: number; pages_fetched: number; refreshed_at: string }> {
    const { data } = await this.client.post('/google-reviews/refresh');
    return data;
  }

  async getGoogleReviewsSummary(): Promise<{
    avg_today: number | null;
    count_today: number;
    avg_overall: number | null;
    count_overall: number;
    avg_as_of_30d: number | null;
    trend_30d: number | null;
    avg_as_of_60d: number | null;
    trend_60d: number | null;
  }> {
    const { data } = await this.client.get('/google-reviews/summary');
    return data;
  }

  async getGoogleReviewsAnalysis(): Promise<{
    result: { summary: any; analyzed: number; total: number; generated_at: string } | null;
    last_analysis_at: string | null;
    remaining_seconds: number;
    cooldown_hours: number;
  }> {
    const { data } = await this.client.get('/google-reviews/analysis');
    return data;
  }

  async getNegativeAnalysis(): Promise<{
    result: {
      months_analyzed: number;
      total_negative: number;
      monthly_counts: Record<string, number>;
      analysis: {
        months: { month: string; review_count: number; top_issues: string[] }[];
        recurring_themes: { theme: string; months_present: string[]; months_count: number; trend: string; description: string }[];
        insights: { importance: string; observation: string; pattern: string }[];
      };
      generated_at: string;
    } | null;
    last_analysis_at: string | null;
    remaining_seconds: number;
    cooldown_hours: number;
  }> {
    const { data } = await this.client.get('/google-reviews/negative-analysis');
    return data;
  }

  async ingestGoogleReviews(file: File): Promise<IngestResult> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await this.client.post<IngestResult>('/google-reviews/ingest', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }

  // ============================================
  // HOME ASSISTANT
  // ============================================

  async getHassGroups(): Promise<any[]> {
    const { data } = await this.client.get('/hass/groups');
    return data;
  }

  async createHassGroup(body: { name: string; interval_seconds: number }): Promise<any> {
    const { data } = await this.client.post('/hass/groups', body);
    return data;
  }

  async updateHassGroup(id: number, body: { name?: string; interval_seconds?: number }): Promise<void> {
    await this.client.patch(`/hass/groups/${id}`, body);
  }

  async deleteHassGroup(id: number): Promise<void> {
    await this.client.delete(`/hass/groups/${id}`);
  }

  async addHassEntity(groupId: number, body: { entity_id: string; friendly_name: string; is_master: boolean }): Promise<any> {
    const { data } = await this.client.post(`/hass/groups/${groupId}/entities`, body);
    return data;
  }

  async updateHassEntity(groupId: number, entityId: string, body: { is_master: boolean }): Promise<void> {
    await this.client.patch(`/hass/groups/${groupId}/entities/${entityId}`, body);
  }

  async removeHassEntity(groupId: number, entityId: string): Promise<void> {
    await this.client.delete(`/hass/groups/${groupId}/entities/${entityId}`);
  }

  async getHassAllEntities(): Promise<any[]> {
    const { data } = await this.client.get('/hass/entities');
    return data;
  }

  async getHassStates(entityIds: string[]): Promise<Record<string, { state: string; last_updated: string }>> {
    const { data } = await this.client.post('/hass/states', { entity_ids: entityIds });
    return data;
  }

  async callHassService(entityId: string, service: 'turn_on' | 'turn_off'): Promise<void> {
    await this.client.post('/hass/service', { entity_id: entityId, service });
  }

  // ============================================
  // AGENDA FURNIZORI
  // ============================================

  async syncAgendaErp(): Promise<{ created_furnizori: number; created_contacts: number }> {
    const { data } = await this.client.post('/agenda/sync-erp');
    return data;
  }

  async getAgendaContacteGlobal(search?: string): Promise<AgendaContact[]> {
    const { data } = await this.client.get<AgendaContact[]>('/agenda/contacte', {
      params: search ? { search } : undefined,
    });
    return data;
  }

  async getAgendaFurnizori(params?: {
    search?: string;
    categorie?: string;
    activ?: boolean;
  }): Promise<AgendaFurnizor[]> {
    const { data } = await this.client.get<AgendaFurnizor[]>('/agenda/furnizori', { params });
    return data;
  }

  async createAgendaFurnizor(body: Partial<AgendaFurnizor>): Promise<{ id: number; nume: string }> {
    const { data } = await this.client.post('/agenda/furnizori', body);
    return data;
  }

  async getAgendaFurnizor(id: number): Promise<AgendaFurnizorDetail> {
    const { data } = await this.client.get<AgendaFurnizorDetail>(`/agenda/furnizori/${id}`);
    return data;
  }

  async updateAgendaFurnizor(id: number, body: Partial<AgendaFurnizor>): Promise<{ ok: boolean }> {
    const { data } = await this.client.patch(`/agenda/furnizori/${id}`, body);
    return data;
  }

  async deleteAgendaFurnizor(id: number): Promise<{ ok: boolean }> {
    const { data } = await this.client.delete(`/agenda/furnizori/${id}`);
    return data;
  }

  async importErpFurnizori(names: string[]): Promise<{ imported: number; skipped: number }> {
    const { data } = await this.client.post('/agenda/furnizori/import-erp', { names });
    return data;
  }

  async getAgendaFurnizorCheltuieli(id: number): Promise<{
    total_ron: number;
    count: number;
    items: any[];
  }> {
    const { data } = await this.client.get(`/agenda/furnizori/${id}/cheltuieli`);
    return data;
  }

  async getAgendaInteractiuni(furnizorId: number): Promise<AgendaInteractiune[]> {
    const { data } = await this.client.get<AgendaInteractiune[]>(`/agenda/furnizori/${furnizorId}/interactiuni`);
    return data;
  }

  async createAgendaInteractiune(furnizorId: number, body: { nota: string; contact_id?: number }): Promise<AgendaInteractiune> {
    const { data } = await this.client.post<AgendaInteractiune>(`/agenda/furnizori/${furnizorId}/interactiuni`, body);
    return data;
  }

  async deleteAgendaInteractiune(id: number): Promise<{ ok: boolean }> {
    const { data } = await this.client.delete(`/agenda/interactiuni/${id}`);
    return data;
  }

  async getAgendaContacte(furnizorId: number): Promise<AgendaContact[]> {
    const { data } = await this.client.get<AgendaContact[]>(`/agenda/furnizori/${furnizorId}/contacte`);
    return data;
  }

  async createAgendaContact(furnizorId: number, body: Partial<AgendaContact> & { campuri?: Partial<AgendaContactCamp>[] }): Promise<AgendaContact> {
    const { data } = await this.client.post<AgendaContact>(`/agenda/furnizori/${furnizorId}/contacte`, body);
    return data;
  }

  async updateAgendaContact(id: number, body: Partial<AgendaContact>): Promise<{ ok: boolean }> {
    const { data } = await this.client.patch(`/agenda/contacte/${id}`, body);
    return data;
  }

  async deleteAgendaContact(id: number): Promise<{ ok: boolean }> {
    const { data } = await this.client.delete(`/agenda/contacte/${id}`);
    return data;
  }

  async createAgendaCamp(contactId: number, body: Partial<AgendaContactCamp>): Promise<AgendaContactCamp> {
    const { data } = await this.client.post<AgendaContactCamp>(`/agenda/contacte/${contactId}/campuri`, body);
    return data;
  }

  async updateAgendaCamp(id: number, body: Partial<AgendaContactCamp>): Promise<{ ok: boolean }> {
    const { data } = await this.client.patch(`/agenda/campuri/${id}`, body);
    return data;
  }

  async deleteAgendaCamp(id: number): Promise<{ ok: boolean }> {
    const { data } = await this.client.delete(`/agenda/campuri/${id}`);
    return data;
  }

  async getAgendaTodos(params?: {
    furnizor_id?: number;
    rezolvat?: boolean;
    tip?: string;
  }): Promise<AgendaTodo[]> {
    const { data } = await this.client.get<AgendaTodo[]>('/agenda/todos', { params });
    return data;
  }

  async createAgendaTodo(body: Partial<AgendaTodo> & { furnizor_id: number }): Promise<AgendaTodo> {
    const { data } = await this.client.post<AgendaTodo>('/agenda/todos', body);
    return data;
  }

  async updateAgendaTodo(id: number, body: Partial<AgendaTodo>): Promise<{ ok: boolean }> {
    const { data } = await this.client.patch(`/agenda/todos/${id}`, body);
    return data;
  }

  async deleteAgendaTodo(id: number): Promise<{ ok: boolean }> {
    const { data } = await this.client.delete(`/agenda/todos/${id}`);
    return data;
  }

  async getAgendaCategorii(): Promise<string[]> {
    const { data } = await this.client.get<string[]>('/agenda/categorii');
    return data;
  }

  async updateAgendaCategorii(categorii: string[]): Promise<{ ok: boolean }> {
    const { data } = await this.client.put('/agenda/categorii', categorii);
    return data;
  }

  async createAgendaContactStandalone(body: import('@/types').AgendaContactCreateStandalone): Promise<AgendaContact> {
    const { data } = await this.client.post<AgendaContact>('/agenda/contacte', body);
    return data;
  }

  // ============================================
  // SYS LOG
  // ============================================

  async getSysLog(params?: { sursa?: string; nivel?: string; limit?: number }): Promise<import('@/types').SysLogEntry[]> {
    const { data } = await this.client.get('/settings/log', { params });
    return data;
  }

  async deleteOldSysLog(): Promise<{ deleted: number }> {
    const { data } = await this.client.delete('/settings/log');
    return data;
  }

  // ============================================
  // COMPETITORI
  // ============================================

  async competitoriListSites(): Promise<any[]> {
    const { data } = await this.client.get('/competitori/sites');
    return data;
  }

  async competitoriAddSite(body: { nume: string; url: string; scraper_key: string; activ: boolean }): Promise<any> {
    const { data } = await this.client.post('/competitori/sites', body);
    return data;
  }

  async competitoriUpdateSite(id: number, body: Partial<{ nume: string; url: string; scraper_key: string; activ: boolean }>): Promise<any> {
    const { data } = await this.client.put(`/competitori/sites/${id}`, body);
    return data;
  }

  async competitoriDeleteSite(id: number): Promise<any> {
    const { data } = await this.client.delete(`/competitori/sites/${id}`);
    return data;
  }

  async competitoriScrapeSite(id: number): Promise<{ site_id: number; products: number; changes: number; embedded: number }> {
    const { data } = await this.client.post(`/competitori/sites/${id}/scrape`);
    return data;
  }

  async competitoriEmbedSite(id: number): Promise<{ total: number; embedded: number; errors: number }> {
    const { data } = await this.client.post(`/competitori/sites/${id}/embed`);
    return data;
  }

  async competitoriSummarize(siteA?: number, siteB?: number): Promise<{
    summary: string;
    uses_vectors: boolean;
    stats: {
      name_a: string; name_b: string;
      matched: number; more_expensive: number; cheaper: number;
      same: number; only_a: number; only_b: number;
    };
  }> {
    const params: Record<string, any> = {};
    if (siteA) params.site_a = siteA;
    if (siteB) params.site_b = siteB;
    const { data } = await this.client.get('/competitori/summarize', { params });
    return data;
  }

  async competitoriListScrapers(): Promise<{ scrapers: string[] }> {
    const { data } = await this.client.get('/competitori/scrapers');
    return data;
  }

  async competitoriCompare(params?: { site_a?: number; site_b?: number; threshold?: number }): Promise<any> {
    const { data } = await this.client.get('/competitori/compare', { params });
    return data;
  }

  async competitoriPriceChanges(limit = 100, site_id?: number): Promise<any[]> {
    const { data } = await this.client.get('/competitori/price-changes', {
      params: { limit, ...(site_id ? { site_id } : {}) },
    });
    return data;
  }

  // ============================================
  // ERP PROD — CLIENȚI
  // ============================================

  async getErpCustomers(params?: { search?: string; skip?: number; limit?: number }): Promise<{
    customers: import('@/types').ErpCustomer[];
    total: number;
    skip: number;
    limit: number;
  }> {
    const { data } = await this.client.get('/erp-prod/customers', { params });
    return data;
  }

  async syncErpCustomers(): Promise<{ added: number; total_fetched: number }> {
    const { data } = await this.client.post('/erp-prod/customers/sync');
    return data;
  }

  // Navigatie / Map pins
  async getMapPins(): Promise<import('@/types').MapPin[]> {
    const { data } = await this.client.get('/navigatie/pins');
    return data;
  }
  async createMapPin(pin: { name: string; address?: string; lat: number; lng: number; color?: string }): Promise<import('@/types').MapPin> {
    const { data } = await this.client.post('/navigatie/pins', pin);
    return data;
  }
  async updateMapPinAddress(id: number, address: string): Promise<{ id: number; lat: number; lng: number }> {
    const { data } = await this.client.patch(`/navigatie/pins/${id}`, { address });
    return data;
  }
  async deleteMapPin(id: number): Promise<void> {
    await this.client.delete(`/navigatie/pins/${id}`);
  }
  async geocodeAddress(q: string): Promise<{ lat: string; lon: string; display_name: string }[]> {
    const { data } = await this.client.get('/navigatie/geocode', { params: { q } });
    return data;
  }
  async getTraccarToken(): Promise<{ token: string | null; url: string | null }> {
    const { data } = await this.client.get('/navigatie/traccar-token');
    return data;
  }

  // Comenzi Azi
  async getComenziorAzi(): Promise<{ comenzi: any[]; total: number }> {
    const { data } = await this.client.get('/comenzi/azi');
    return data;
  }
  async marcheazaHartaTot(): Promise<{ added: number; failed: string[]; total_livrari: number }> {
    const { data } = await this.client.post('/comenzi/marcare-harta-toate');
    return data;
  }
  async marcheazaPin(payload: { address: string; customer_name: string; color: string; note?: string }): Promise<{ id: number; lat: number; lng: number }> {
    const { data } = await this.client.post('/comenzi/marcare-pin', payload);
    return data;
  }
  async getTraccarPozitii(): Promise<{ vehicles: any[]; configured: boolean; error?: string }> {
    const { data } = await this.client.get('/navigatie/traccar/pozitii');
    return data;
  }
  async incrementMapsJsCounter(): Promise<void> {
    await this.client.post('/navigatie/maps-js/count').catch(() => {});
  }
  async syncComenziHarta(): Promise<{ added: number; updated: number; unchanged: number; failed: string[] }> {
    const { data } = await this.client.post('/comenzi/sync-harta');
    return data;
  }
  async calculeazaRute(payload: {
    comenzi: any[];
    sofer1_ids?: string[];
    sofer2_ids?: string[];
    engines?: string[];
  }): Promise<any> {
    const { data } = await this.client.post('/comenzi/rute', payload);
    return data;
  }

  // ── Public GPS endpoints (no auth, key never exposed) ──────────────────────
  async getPublicGpsSettings(): Promise<{ has_maps_key: boolean }> {
    const { data } = await this.client.get('/public/gps/settings');
    return data;
  }
  getPublicMapsJsUrl(): string {
    return `${API_URL}/public/gps/maps-js`;
  }
  async getPublicGpsPins(): Promise<import('@/types').MapPin[]> {
    const { data } = await this.client.get('/public/gps/pins');
    return data;
  }
  async getPublicGpsPozitii(): Promise<{ vehicles: any[]; configured: boolean; error?: string }> {
    const { data } = await this.client.get('/public/gps/pozitii');
    return data;
  }
  async getPublicGpsComenzii(): Promise<{ comenzi: any[]; total: number }> {
    const { data } = await this.client.get('/public/gps/comenzi');
    return data;
  }
  async syncPublicGpsHarta(): Promise<{ added: number; updated: number; unchanged: number; failed: string[] }> {
    const { data } = await this.client.post('/public/gps/sync');
    return data;
  }
  async incrementPublicMapsJsCounter(): Promise<void> {
    await this.client.post('/public/gps/maps-js/count').catch(() => {});
  }

  // ============================================
  // ANALIZA COMENZI
  // ============================================
  async getOrdersCount(): Promise<{ total: number; latest_number: number | null; latest_date: string | null }> {
    const { data } = await this.client.get('/orders/count');
    return data;
  }

  async syncOrdersIncremental(): Promise<{ added: number; pages: number }> {
    const { data } = await this.client.post('/orders/sync/incremental');
    return data;
  }

  async syncOrdersYesterday(): Promise<{ deleted: number; added: number; date: string }> {
    const { data } = await this.client.post('/orders/sync/yesterday');
    return data;
  }

  async getBackfillStatus(): Promise<{
    running: boolean; paused: boolean; total: number; done: number; errors: number; mismatched: number;
    started_at: string | null; finished_at: string | null;
    synced_in_db: number; total_in_db: number; current_number: number | null;
  }> {
    const { data } = await this.client.get('/orders/lines/backfill-status');
    return data;
  }

  async startBackfill(): Promise<{ status: string }> {
    const { data } = await this.client.post('/orders/lines/backfill/start');
    return data;
  }

  async pauseBackfill(): Promise<{ paused: boolean }> {
    const { data } = await this.client.post('/orders/lines/backfill/pause');
    return data;
  }

  async getTopProduse(data_start: string, data_end: string, limit = 30): Promise<{
    produse: { product_name: string; product_group: string | null; qty_total: number; val_total: number; nr_comenzi: number }[];
    orders_synced: number; orders_total: number; coverage_pct: number;
  }> {
    const { data } = await this.client.get('/orders/produse', { params: { data_start, data_end, limit } });
    return data;
  }

  async getPredictiiProduse(horizon_min = 20, top_n = 20, model: 'rf' | 'lgb' = 'rf'): Promise<{
    now: string; window_start: string; horizon_min: number;
    day_of_week: string; month: number; season: string; model: string;
    lgb_available: boolean;
    predictions: { product_name: string; predicted_qty: number; probability: number }[];
    trained_at: string | null; model_count: number;
    days_of_data: number; orders_count: number; data_quality: string;
    training: boolean; error: string | null;
  }> {
    const { data } = await this.client.get('/predictii/produse', { params: { horizon_min, top_n, model } });
    return data;
  }

  async getPredictiiZiua(model: 'rf' | 'lgb' = 'rf'): Promise<{
    model: string; data: string; open_hour: number; close_hour: number;
    lgb_available: boolean; trained_at: string | null;
    products: { product: string; probabilitate: number; cantitate_estimata: number; cantitate_deja: number }[];
  }> {
    const { data } = await this.client.get('/predictii/ziua', { params: { model } });
    return data;
  }

  async getPredictiiOre(model: 'rf' | 'lgb' = 'rf'): Promise<{
    model: string; data: string; ora_curenta: number;
    open_hour: number; close_hour: number;
    lgb_available: boolean; trained_at: string | null;
    ore: Record<string, { product: string; probabilitate: number }[]>;
  }> {
    const { data } = await this.client.get('/predictii/ore', { params: { model } });
    return data;
  }

  async getPredictiiDeja(): Promise<{
    data: string; ora: string;
    products: { product: string; cantitate: number; ultima: string | null }[];
  }> {
    const { data } = await this.client.get('/predictii/deja');
    return data;
  }

  async getPredictiiSetari(): Promise<{ open_hour: number; close_hour: number }> {
    const { data } = await this.client.get('/predictii/setari');
    return data;
  }

  async savePredictiiSetari(payload: { open_hour: number; close_hour: number }): Promise<{ open_hour: number; close_hour: number }> {
    const { data } = await this.client.post('/predictii/setari', payload);
    return data;
  }

  async retrain(): Promise<{ status: string; model_count: number; lgb_available: boolean; error: string | null; trained_at: string | null }> {
    const { data } = await this.client.post('/predictii/retrain');
    return data;
  }

  async getBacktest(target_dt: string, horizon_min = 20, top_n = 40, model: 'rf' | 'lgb' = 'rf'): Promise<{
    target_dt: string; window_start: string; window_end: string;
    window_date: string; day_of_week: string; season: string; model: string;
    results: {
      product_name: string; predicted_qty: number; probability: number;
      actual_qty: number; diff: number; in_model: boolean; in_actuals: boolean;
    }[];
    total_actual: number; total_predicted: number;
    actuals_count: number; model_count: number; no_data: boolean;
  }> {
    const { data } = await this.client.get('/predictii/backtest', {
      params: { target_dt, horizon_min, top_n, model },
    });
    return data;
  }

  async getPredictiiStatus(): Promise<{
    trained_at: string | null; model_count: number; product_count: number;
    lgb_available: boolean; training: boolean; error: string | null;
  }> {
    const { data } = await this.client.get('/predictii/status');
    return data;
  }

  async getAnalizaComenzi(data_start: string, data_end: string): Promise<{
    total: number;
    dinein: number;
    livrare: number;
    ridicare: number;
    valoare_totala: number;
    valoare_medie: number;
    by_hour_dinein: { ora: number; count: number }[];
    by_hour_livrare: { ora: number; livrare: number; ridicare: number }[];
    by_hour_dinein_val: { ora: number; valoare: number }[];
    by_hour_livrare_val: { ora: number; livrare: number; ridicare: number }[];
    by_date: { data: string; count: number; valoare: number }[];
    db_count: number;
  }> {
    const { data } = await this.client.get('/comenzi/analiza', { params: { data_start, data_end } });
    return data;
  }
}

export const api = new ApiService();
export default api;
