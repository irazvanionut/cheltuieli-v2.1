from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime, date
from decimal import Decimal


# ============================================
# AUTH SCHEMAS
# ============================================

class LoginRequest(BaseModel):
    cod_acces: str = Field(..., min_length=1, description="Cod acces sau card")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserBase(BaseModel):
    username: str
    nume_complet: str
    rol: str = "operator"


class UserCreate(UserBase):
    cod_acces: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    nume_complet: Optional[str] = None
    cod_acces: Optional[str] = None
    rol: Optional[str] = None
    activ: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    activ: bool
    ultima_autentificare: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================
# SETTINGS SCHEMAS
# ============================================

class SettingBase(BaseModel):
    cheie: str
    valoare: Optional[str] = None
    tip: str = "string"
    descriere: Optional[str] = None


class SettingUpdate(BaseModel):
    valoare: Optional[str] = None


class SettingResponse(SettingBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================
# PORTOFEL SCHEMAS
# ============================================

class PortofelBase(BaseModel):
    nume: str
    descriere: Optional[str] = None
    ordine: int = 0


class PortofelCreate(PortofelBase):
    pass


class PortofelUpdate(BaseModel):
    nume: Optional[str] = None
    descriere: Optional[str] = None
    ordine: Optional[int] = None
    activ: Optional[bool] = None


class PortofelResponse(PortofelBase):
    id: int
    activ: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PortofelSoldResponse(PortofelResponse):
    sold_total: Dict[str, Decimal] = {}
    sold_zi_curenta: Dict[str, Decimal] = {}


# ============================================
# CATEGORIE SCHEMAS
# ============================================

class CategorieBase(BaseModel):
    nume: str
    descriere: Optional[str] = None
    culoare: str = "#6B7280"
    afecteaza_sold: bool = True
    ordine: int = 0


class CategorieCreate(CategorieBase):
    pass


class CategorieUpdate(BaseModel):
    nume: Optional[str] = None
    descriere: Optional[str] = None
    culoare: Optional[str] = None
    afecteaza_sold: Optional[bool] = None
    ordine: Optional[int] = None
    activ: Optional[bool] = None


class CategorieResponse(CategorieBase):
    id: int
    activ: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================
# GRUPA SCHEMAS
# ============================================

class GrupaBase(BaseModel):
    nume: str
    categorie_id: Optional[int] = None
    ordine: int = 0


class GrupaCreate(GrupaBase):
    pass


class GrupaUpdate(BaseModel):
    nume: Optional[str] = None
    categorie_id: Optional[int] = None
    ordine: Optional[int] = None
    activ: Optional[bool] = None


class GrupaResponse(GrupaBase):
    id: int
    activ: bool
    categorie_nume: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================
# NOMENCLATOR SCHEMAS
# ============================================

class NomenclatorBase(BaseModel):
    denumire: str
    categorie_id: Optional[int] = None
    grupa_id: Optional[int] = None
    tip_entitate: str = "Altele"


class NomenclatorCreate(NomenclatorBase):
    pass


class NomenclatorUpdate(BaseModel):
    denumire: Optional[str] = None
    categorie_id: Optional[int] = None
    grupa_id: Optional[int] = None
    tip_entitate: Optional[str] = None
    activ: Optional[bool] = None


class NomenclatorResponse(NomenclatorBase):
    id: int
    activ: bool
    frecventa_utilizare: int = 0
    ultima_utilizare: Optional[datetime] = None
    categorie_nume: Optional[str] = None
    grupa_nume: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AutocompleteResult(BaseModel):
    id: Optional[int] = None
    denumire: str
    categorie_id: Optional[int] = None
    categorie_nume: Optional[str] = None
    grupa_id: Optional[int] = None
    grupa_nume: Optional[str] = None
    tip_entitate: Optional[str] = None
    similarity: float = 0.0


# ============================================
# EXERCITIU SCHEMAS
# ============================================

class ExercitiumBase(BaseModel):
    data: date
    observatii: Optional[str] = None


class ExercitiumCreate(BaseModel):
    data: Optional[date] = None  # Default = today
    observatii: Optional[str] = None


class ExercitiumClose(BaseModel):
    observatii: Optional[str] = None


class ExercitiumResponse(ExercitiumBase):
    id: int
    ora_deschidere: datetime
    ora_inchidere: Optional[datetime] = None
    activ: bool
    inchis_de: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================
# CHELTUIALA SCHEMAS
# ============================================

class CheltuialaBase(BaseModel):
    portofel_id: int
    suma: Decimal
    moneda: str = "RON"
    sens: str = "Cheltuiala"
    comentarii: Optional[str] = None


class CheltuialaCreate(CheltuialaBase):
    nomenclator_id: Optional[int] = None
    denumire_custom: Optional[str] = None
    categorie_id: Optional[int] = None
    grupa_id: Optional[int] = None
    neplatit: bool = False


class CheltuialaUpdate(BaseModel):
    portofel_id: Optional[int] = None
    suma: Optional[Decimal] = None
    neplatit: Optional[bool] = None
    verificat: Optional[bool] = None
    comentarii: Optional[str] = None
    activ: Optional[bool] = None


class CheltuialaResponse(CheltuialaBase):
    id: int
    exercitiu_id: int
    nomenclator_id: Optional[int] = None
    denumire_custom: Optional[str] = None
    categorie_id: Optional[int] = None
    grupa_id: Optional[int] = None
    neplatit: bool
    verificat: bool
    verificat_de: Optional[int] = None
    verificat_la: Optional[datetime] = None
    operator_id: Optional[int] = None
    activ: bool
    created_at: datetime
    
    # Joined fields
    denumire: Optional[str] = None
    portofel_nume: Optional[str] = None
    categorie_nume: Optional[str] = None
    categorie_culoare: Optional[str] = None
    grupa_nume: Optional[str] = None
    operator_nume: Optional[str] = None
    exercitiu_data: Optional[date] = None
    exercitiu_activ: Optional[bool] = None

    class Config:
        from_attributes = True


# ============================================
# TRANSFER SCHEMAS
# ============================================

class TransferCreate(BaseModel):
    portofel_sursa_id: int
    portofel_dest_id: int
    suma: Decimal
    moneda: str = "RON"
    suma_dest: Optional[Decimal] = None
    moneda_dest: Optional[str] = None
    comentarii: Optional[str] = None


class TransferUpdate(BaseModel):
    portofel_sursa_id: Optional[int] = None
    portofel_dest_id: Optional[int] = None
    suma: Optional[Decimal] = None
    moneda: Optional[str] = None
    suma_dest: Optional[Decimal] = None
    moneda_dest: Optional[str] = None
    comentarii: Optional[str] = None


class TransferResponse(BaseModel):
    id: int
    exercitiu_id: int
    portofel_sursa_id: int
    portofel_dest_id: int
    suma: Decimal
    moneda: str = "RON"
    suma_dest: Optional[Decimal] = None
    moneda_dest: Optional[str] = None
    operator_id: Optional[int] = None
    comentarii: Optional[str] = None
    created_at: datetime

    portofel_sursa_nume: Optional[str] = None
    portofel_dest_nume: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================
# ALIMENTARE SCHEMAS
# ============================================

class AlimentareCreate(BaseModel):
    portofel_id: int
    suma: Decimal
    moneda: str = "RON"
    comentarii: Optional[str] = None


class AlimentareUpdate(BaseModel):
    portofel_id: Optional[int] = None
    suma: Optional[Decimal] = None
    moneda: Optional[str] = None
    comentarii: Optional[str] = None


class AlimentareResponse(BaseModel):
    id: int
    exercitiu_id: int
    portofel_id: int
    suma: Decimal
    moneda: str = "RON"
    operator_id: Optional[int] = None
    comentarii: Optional[str] = None
    created_at: datetime

    portofel_nume: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================
# RAPORT SCHEMAS
# ============================================

class RaportCategorieItem(BaseModel):
    denumire: str
    suma: Decimal
    moneda: str = "RON"
    neplatit: bool
    verificat: bool
    cheltuiala_id: int


class RaportGrupa(BaseModel):
    grupa_id: Optional[int]
    grupa_nume: Optional[str]
    items: List[RaportCategorieItem]
    total: Dict[str, Decimal] = {}


class RaportCategorie(BaseModel):
    categorie_id: int
    categorie_nume: str
    categorie_culoare: str
    afecteaza_sold: bool
    grupe: List[RaportGrupa]
    total_platit: Dict[str, Decimal] = {}
    total_neplatit: Dict[str, Decimal] = {}
    total: Dict[str, Decimal] = {}


class RaportPortofel(BaseModel):
    portofel_id: int
    portofel_nume: str
    sold: Dict[str, Decimal] = {}
    total_alimentari: Dict[str, Decimal] = {}
    total_cheltuieli: Dict[str, Decimal] = {}
    total_transferuri_in: Dict[str, Decimal] = {}
    total_transferuri_out: Dict[str, Decimal] = {}


class RaportZilnic(BaseModel):
    exercitiu_id: int
    data: date
    activ: bool
    categorii: List[RaportCategorie]
    portofele: List[RaportPortofel]
    total_cheltuieli: Dict[str, Decimal] = {}
    total_neplatit: Dict[str, Decimal] = {}
    total_sold: Dict[str, Decimal] = {}


# ============================================
# CHAT SCHEMAS
# ============================================

class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str
    context_used: Optional[dict] = None


# ============================================
# RECOMANDARI APELURI SCHEMAS
# ============================================

class RecomandariApelCreate(BaseModel):
    conversations: List[Dict] = []
    summary: Optional[Dict] = None


class RecomandariApelResponse(BaseModel):
    id: int
    data: date
    total_conversatii: int = 0
    conversations: List[Dict] = []
    top_recomandari: List[Dict] = []
    top_lucruri_bune: List[Dict] = []
    created_at: datetime

    class Config:
        from_attributes = True


# Forward references
TokenResponse.model_rebuild()
