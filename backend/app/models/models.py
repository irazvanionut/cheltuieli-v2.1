from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, Text, ForeignKey, Date, UniqueConstraint, SmallInteger, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

from app.core.database import Base


class Setting(Base):
    __tablename__ = "settings"
    
    id = Column(Integer, primary_key=True, index=True)
    cheie = Column(String(100), unique=True, nullable=False)
    valoare = Column(Text)
    tip = Column(String(20), default='string')
    descriere = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    nume_complet = Column(String(100), nullable=False)
    cod_acces = Column(String(100), nullable=False)
    rol = Column(String(20), nullable=False, default='operator')
    activ = Column(Boolean, default=True)
    ultima_autentificare = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    cheltuieli = relationship("Cheltuiala", back_populates="operator", foreign_keys="Cheltuiala.operator_id")


class Portofel(Base):
    __tablename__ = "portofele"
    
    id = Column(Integer, primary_key=True, index=True)
    nume = Column(String(50), unique=True, nullable=False)
    descriere = Column(Text)
    ordine = Column(Integer, default=0)
    activ = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    cheltuieli = relationship("Cheltuiala", back_populates="portofel")
    alimentari = relationship("Alimentare", back_populates="portofel")


class Categorie(Base):
    __tablename__ = "categorii"
    
    id = Column(Integer, primary_key=True, index=True)
    nume = Column(String(50), unique=True, nullable=False)
    descriere = Column(Text)
    culoare = Column(String(7), default='#6B7280')
    afecteaza_sold = Column(Boolean, default=True)
    ordine = Column(Integer, default=0)
    activ = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    grupe = relationship("Grupa", back_populates="categorie")
    nomenclatoare = relationship("Nomenclator", back_populates="categorie")
    cheltuieli = relationship("Cheltuiala", back_populates="categorie")


class Grupa(Base):
    __tablename__ = "grupe"
    
    id = Column(Integer, primary_key=True, index=True)
    nume = Column(String(50), nullable=False)
    categorie_id = Column(Integer, ForeignKey("categorii.id", ondelete="SET NULL"))
    ordine = Column(Integer, default=0)
    activ = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    categorie = relationship("Categorie", back_populates="grupe")
    nomenclatoare = relationship("Nomenclator", back_populates="grupa")
    cheltuieli = relationship("Cheltuiala", back_populates="grupa")


class Nomenclator(Base):
    __tablename__ = "nomenclator"
    
    id = Column(Integer, primary_key=True, index=True)
    denumire = Column(String(255), nullable=False)
    categorie_id = Column(Integer, ForeignKey("categorii.id", ondelete="SET NULL"))
    grupa_id = Column(Integer, ForeignKey("grupe.id", ondelete="SET NULL"))
    tip_entitate = Column(String(50), default='Altele')
    embedding = Column(Vector(1024))
    frecventa_utilizare = Column(Integer, default=0)
    ultima_utilizare = Column(DateTime)
    activ = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    categorie = relationship("Categorie", back_populates="nomenclatoare")
    grupa = relationship("Grupa", back_populates="nomenclatoare")
    cheltuieli = relationship("Cheltuiala", back_populates="nomenclator")


class Exercitiu(Base):
    __tablename__ = "exercitii"
    
    id = Column(Integer, primary_key=True, index=True)
    data = Column(Date, unique=True, nullable=False)
    ora_deschidere = Column(DateTime, server_default=func.now())
    ora_inchidere = Column(DateTime)
    inchis_de = Column(Integer, ForeignKey("users.id"))
    activ = Column(Boolean, default=True)
    observatii = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    cheltuieli = relationship("Cheltuiala", back_populates="exercitiu")
    transferuri = relationship("Transfer", back_populates="exercitiu")
    alimentari = relationship("Alimentare", back_populates="exercitiu")


class Cheltuiala(Base):
    __tablename__ = "cheltuieli"
    
    id = Column(Integer, primary_key=True, index=True)
    exercitiu_id = Column(Integer, ForeignKey("exercitii.id", ondelete="CASCADE"))
    portofel_id = Column(Integer, ForeignKey("portofele.id"))
    nomenclator_id = Column(Integer, ForeignKey("nomenclator.id"))
    
    denumire_custom = Column(String(255))
    categorie_id = Column(Integer, ForeignKey("categorii.id"))
    grupa_id = Column(Integer, ForeignKey("grupe.id"))
    
    suma = Column(Numeric(12, 2), nullable=False)
    moneda = Column(String(3), default='RON')  # RON, EUR, USD
    sens = Column(String(20), nullable=False)  # Cheltuiala, Incasare, Alimentare, Transfer

    neplatit = Column(Boolean, default=False)
    verificat = Column(Boolean, default=False)
    verificat_de = Column(Integer, ForeignKey("users.id"))
    verificat_la = Column(DateTime)
    
    operator_id = Column(Integer, ForeignKey("users.id"))
    comentarii = Column(Text)
    activ = Column(Boolean, default=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    exercitiu = relationship("Exercitiu", back_populates="cheltuieli")
    portofel = relationship("Portofel", back_populates="cheltuieli")
    nomenclator = relationship("Nomenclator", back_populates="cheltuieli")
    categorie = relationship("Categorie", back_populates="cheltuieli")
    grupa = relationship("Grupa", back_populates="cheltuieli")
    operator = relationship("User", back_populates="cheltuieli", foreign_keys=[operator_id])


class Transfer(Base):
    __tablename__ = "transferuri"
    
    id = Column(Integer, primary_key=True, index=True)
    exercitiu_id = Column(Integer, ForeignKey("exercitii.id", ondelete="CASCADE"))
    
    portofel_sursa_id = Column(Integer, ForeignKey("portofele.id"))
    portofel_dest_id = Column(Integer, ForeignKey("portofele.id"))
    
    cheltuiala_sursa_id = Column(Integer, ForeignKey("cheltuieli.id", ondelete="CASCADE"))
    cheltuiala_dest_id = Column(Integer, ForeignKey("cheltuieli.id", ondelete="CASCADE"))
    
    suma = Column(Numeric(12, 2), nullable=False)
    moneda = Column(String(3), default='RON')  # RON, EUR, USD
    suma_dest = Column(Numeric(12, 2))      # nullable — same-currency transfers leave NULL
    moneda_dest = Column(String(3))          # nullable
    operator_id = Column(Integer, ForeignKey("users.id"))
    comentarii = Column(Text)

    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    exercitiu = relationship("Exercitiu", back_populates="transferuri")


class Alimentare(Base):
    __tablename__ = "alimentari"
    
    id = Column(Integer, primary_key=True, index=True)
    exercitiu_id = Column(Integer, ForeignKey("exercitii.id", ondelete="CASCADE"))
    portofel_id = Column(Integer, ForeignKey("portofele.id"))
    suma = Column(Numeric(12, 2), nullable=False)
    moneda = Column(String(3), default='RON')  # RON, EUR, USD
    operator_id = Column(Integer, ForeignKey("users.id"))
    comentarii = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    exercitiu = relationship("Exercitiu", back_populates="alimentari")
    portofel = relationship("Portofel", back_populates="alimentari")


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    message = Column(Text, nullable=False)
    response = Column(Text)
    embedding = Column(Vector(1024))
    context_used = Column(Text)  # JSON
    created_at = Column(DateTime, server_default=func.now())


class ApeluriZilnic(Base):
    __tablename__ = "apeluri_zilnic"

    id = Column(Integer, primary_key=True, index=True)
    data = Column(Date, unique=True, nullable=False)
    total = Column(Integer, default=0)
    answered = Column(Integer, default=0)
    abandoned = Column(Integer, default=0)
    answer_rate = Column(Integer, default=0)
    abandon_rate = Column(Integer, default=0)
    asa = Column(Integer, default=0)
    waited_over_30 = Column(Integer, default=0)
    hold_answered_avg = Column(Integer, default=0)
    hold_answered_median = Column(Integer, default=0)
    hold_answered_p90 = Column(Integer, default=0)
    hold_abandoned_avg = Column(Integer, default=0)
    hold_abandoned_median = Column(Integer, default=0)
    hold_abandoned_p90 = Column(Integer, default=0)
    call_duration_avg = Column(Integer, default=0)
    call_duration_median = Column(Integer, default=0)
    call_duration_p90 = Column(Integer, default=0)
    hourly_data = Column(JSONB, default=[])
    created_at = Column(DateTime, server_default=func.now())

    detalii = relationship("ApeluriDetalii", back_populates="zilnic", cascade="all, delete-orphan")


class ApeluriDetalii(Base):
    __tablename__ = "apeluri_detalii"

    id = Column(Integer, primary_key=True, index=True)
    apeluri_zilnic_id = Column(Integer, ForeignKey("apeluri_zilnic.id", ondelete="CASCADE"), nullable=False)
    callid = Column(String(100))
    caller_id = Column(String(100))
    agent = Column(String(50))
    status = Column(String(20), nullable=False)
    ora = Column(String(10))
    hold_time = Column(Integer, default=0)
    call_time = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

    zilnic = relationship("ApeluriZilnic", back_populates="detalii")


class RecomandariApeluri(Base):
    __tablename__ = "recomandari_apeluri"

    id = Column(Integer, primary_key=True, index=True)
    data = Column(Date, nullable=False, index=True)
    ai_model = Column(String(20), default='Claude', nullable=False)
    total_conversatii = Column(Integer, default=0)
    conversations = Column(JSONB, default=[])
    top_recomandari = Column(JSONB, default=[])
    top_lucruri_bune = Column(JSONB, default=[])
    tip_apeluri = Column(JSONB, default={})
    created_at = Column(DateTime, server_default=func.now())


class AmiApel(Base):
    """Real-time AMI call log — written on every queue event, persists across restarts."""
    __tablename__ = "ami_apeluri"

    id = Column(Integer, primary_key=True, index=True)
    callid = Column(String(100), unique=True, nullable=False, index=True)
    caller_id = Column(String(100), default="")
    agent = Column(String(50), default="")
    queue = Column(String(100), default="")
    status = Column(String(20), nullable=False)
    data = Column(Date, nullable=False, index=True)
    ora = Column(String(10))
    hold_time = Column(Integer, default=0)
    call_time = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class GoogleReview(Base):
    __tablename__ = "google_reviews"

    id = Column(Integer, primary_key=True, index=True)
    review_id = Column(String(512), unique=True, nullable=False, index=True)
    rating = Column(Integer, nullable=False)
    iso_date = Column(DateTime(timezone=True), nullable=False, index=True)
    date_text = Column(String(100))
    snippet = Column(Text)
    snippet_translated = Column(Text)
    # User info
    user_name = Column(String(255))
    user_link = Column(Text)
    contributor_id = Column(String(100))
    user_thumbnail = Column(Text)
    local_guide = Column(Boolean, default=False)
    user_reviews_count = Column(Integer, default=0)
    user_photos_count = Column(Integer, default=0)
    # Detail ratings
    food_rating = Column(Integer)
    service_rating = Column(Integer)
    atmosphere_rating = Column(Integer)
    # Extra details (price, noise, etc.)
    details = Column(JSONB, default={})
    images = Column(JSONB, default=[])
    review_link = Column(Text)
    likes = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())


class HassGroup(Base):
    __tablename__ = "hass_groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    interval_seconds = Column(Integer, default=3)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    entities = relationship("HassGroupEntity", back_populates="group", cascade="all, delete-orphan")


class HassGroupEntity(Base):
    __tablename__ = "hass_group_entities"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("hass_groups.id", ondelete="CASCADE"), nullable=False)
    entity_id = Column(String(200), nullable=False)
    friendly_name = Column(String(200))
    is_master = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    group = relationship("HassGroup", back_populates="entities")

    __table_args__ = (UniqueConstraint("group_id", "entity_id"),)


# ============================================
# AGENDA FURNIZORI
# ============================================

class AgendaFurnizor(Base):
    __tablename__ = "agenda_furnizori"

    id = Column(Integer, primary_key=True, index=True)
    erp_name = Column(String(255))          # link opțional la ERP
    nume = Column(String(255), nullable=False)
    categorie = Column(String(100))         # Alimente, Băuturi, etc.
    zile_livrare = Column(String(100))      # "Luni,Miercuri,Vineri"
    frecventa_comanda = Column(String(50))  # Săptămânal | Bisăptămânal | Lunar | La cerere
    discount_procent = Column(Numeric(5, 2))
    termen_plata_zile = Column(Integer)     # 0=cash, 30, 60, 90
    suma_minima_comanda = Column(Numeric(10, 2))
    rating_intern = Column(SmallInteger)   # 1-5
    note_generale = Column(Text)
    atentie = Column(Boolean, default=False)
    activ = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    contacte = relationship("AgendaContact", back_populates="furnizor", cascade="all, delete-orphan")
    interactiuni = relationship("AgendaInteractiune", back_populates="furnizor", cascade="all, delete-orphan")
    todos = relationship("AgendaTodo", back_populates="furnizor", cascade="all, delete-orphan")


class AgendaContact(Base):
    __tablename__ = "agenda_contacte"

    id = Column(Integer, primary_key=True, index=True)
    furnizor_id = Column(Integer, ForeignKey("agenda_furnizori.id", ondelete="CASCADE"))
    nume = Column(String(255), nullable=False)
    rol = Column(String(100))               # Agent | Livrator | Director | Casier | Alt
    primar = Column(Boolean, default=False)
    erp_contact = Column(Boolean, default=False)
    activ = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    furnizor = relationship("AgendaFurnizor", back_populates="contacte")
    campuri = relationship("AgendaContactCamp", back_populates="contact", cascade="all, delete-orphan")
    interactiuni = relationship("AgendaInteractiune", back_populates="contact")


class AgendaContactCamp(Base):
    __tablename__ = "agenda_contacte_campuri"

    id = Column(Integer, primary_key=True, index=True)
    contact_id = Column(Integer, ForeignKey("agenda_contacte.id", ondelete="CASCADE"))
    tip = Column(String(50), nullable=False)    # Mobil | Telefon | Email | WhatsApp | Website | Alt
    valoare = Column(String(255), nullable=False)
    ordine = Column(Integer, default=0)

    # Relationships
    contact = relationship("AgendaContact", back_populates="campuri")


class AgendaInteractiune(Base):
    __tablename__ = "agenda_interactiuni"

    id = Column(Integer, primary_key=True, index=True)
    furnizor_id = Column(Integer, ForeignKey("agenda_furnizori.id", ondelete="CASCADE"))
    contact_id = Column(Integer, ForeignKey("agenda_contacte.id", ondelete="SET NULL"), nullable=True)
    nota = Column(Text, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    furnizor = relationship("AgendaFurnizor", back_populates="interactiuni")
    contact = relationship("AgendaContact", back_populates="interactiuni")
    user = relationship("User")


class SmsTemplate(Base):
    __tablename__ = "sms_templates"

    id = Column(Integer, primary_key=True, index=True)
    titlu = Column(String(100), nullable=False)
    corp = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SmsLog(Base):
    __tablename__ = "sms_log"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String(30), nullable=False)
    message = Column(Text, nullable=False)
    ok = Column(Boolean, nullable=False, default=True)
    error_msg = Column(Text)
    sent_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now())


class SysLog(Base):
    __tablename__ = "sys_log"

    id = Column(Integer, primary_key=True, index=True)
    ts = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    nivel = Column(String(10), nullable=False, default='ERROR')
    sursa = Column(String(50), nullable=False)
    mesaj = Column(Text, nullable=False)
    detalii = Column(Text, nullable=True)


class AgendaTodo(Base):
    __tablename__ = "agenda_todos"

    id = Column(Integer, primary_key=True, index=True)
    furnizor_id = Column(Integer, ForeignKey("agenda_furnizori.id", ondelete="CASCADE"))
    titlu = Column(String(500), nullable=False)
    cantitate = Column(String(100))         # "2 cutii", "5 kg" (opțional)
    tip = Column(String(20), default='todo')  # todo | comanda
    prioritate = Column(SmallInteger, default=2)  # 1=urgentă, 2=normală, 3=scăzută
    rezolvat = Column(Boolean, default=False)
    data_scadenta = Column(Date, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    furnizor = relationship("AgendaFurnizor", back_populates="todos")
    user = relationship("User")


# ============================================
# ERP PROD — CLIENȚI
# ============================================

class ErpCustomer(Base):
    __tablename__ = "erp_customers"

    id        = Column(Integer, primary_key=True, index=True)
    erp_id    = Column(String(100), unique=True, nullable=False, index=True)
    name      = Column(String(255))
    address   = Column(Text)
    phone     = Column(String(100))
    email     = Column(String(255))
    type      = Column(String(100))
    synced_at = Column(DateTime, server_default=func.now())
    created_at= Column(DateTime, server_default=func.now())


# ============================================
# MAP PINS
# ============================================

class MapPin(Base):
    __tablename__ = "map_pins"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(255), nullable=False)
    address    = Column(Text)
    lat        = Column(Numeric(10, 7), nullable=False)
    lng        = Column(Numeric(10, 7), nullable=False)
    color            = Column(String(20), default="blue")
    permanent        = Column(Boolean, default=False)
    note             = Column(String(255))
    travel_time_min  = Column(Float)
    created_at       = Column(DateTime, server_default=func.now())


class GeocodeOverride(Base):
    __tablename__ = "geocode_overrides"
    id                 = Column(Integer, primary_key=True)
    address_normalized = Column(String(500), unique=True, nullable=False, index=True)
    lat                = Column(Numeric(10, 7), nullable=False)
    lng                = Column(Numeric(10, 7), nullable=False)
    created_at         = Column(DateTime, server_default=func.now())
    updated_at         = Column(DateTime, server_default=func.now(), onupdate=func.now())

# ============================================
# COMPETITORI
# ============================================

class CompetitorSite(Base):
    __tablename__ = "competitor_sites"

    id = Column(Integer, primary_key=True, index=True)
    nume = Column(String(100), nullable=False)
    url = Column(String(500), nullable=False)
    scraper_key = Column(String(50), nullable=False)
    activ = Column(Boolean, default=True)
    last_scraped_at = Column(DateTime)
    scrape_error = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    products = relationship("CompetitorProduct", back_populates="site", cascade="all, delete-orphan")
    price_changes = relationship("CompetitorPriceChange", back_populates="site", cascade="all, delete-orphan")


class CompetitorProduct(Base):
    __tablename__ = "competitor_products"

    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("competitor_sites.id", ondelete="CASCADE"))
    categorie = Column(String(200))
    denumire = Column(String(500), nullable=False)
    pret = Column(Numeric(10, 2))
    unitate = Column(String(100))
    extra = Column(JSONB)
    embedding = Column(JSONB)  # Ollama vector as JSON array (dimension = configured model)
    scraped_at = Column(DateTime, server_default=func.now())

    site = relationship("CompetitorSite", back_populates="products")


class CompetitorPriceChange(Base):
    __tablename__ = "competitor_price_changes"

    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("competitor_sites.id", ondelete="CASCADE"))
    denumire = Column(String(500), nullable=False)
    pret_vechi = Column(Numeric(10, 2))
    pret_nou = Column(Numeric(10, 2))
    changed_at = Column(DateTime, server_default=func.now())

    site = relationship("CompetitorSite", back_populates="price_changes")


class Comanda(Base):
    """OrderProjection history synced from ERP Prod."""
    __tablename__ = "comenzi"

    id                   = Column(Integer, primary_key=True)
    erp_id               = Column(String(64), unique=True, nullable=False, index=True)
    number               = Column(Integer, index=True)
    index_in_interval    = Column(Integer)
    created_at_erp       = Column(DateTime(timezone=True), index=True)
    erp_time             = Column(String(10))
    erp_date             = Column(String(20))
    journal_dt           = Column(DateTime(timezone=True))
    order_info           = Column(Text)
    ship_to_address      = Column(Text)
    phone                = Column(String(30), index=True)
    email                = Column(String(200))
    staff_order_name     = Column(String(200))
    total                = Column(Numeric(10, 2))
    payload_json         = Column(Text)
    linii_synced         = Column(Boolean, default=False)
    linii_needs_refresh  = Column(Boolean, default=False)
    current_status       = Column(Integer)
    synced_at            = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at           = Column(DateTime(timezone=True), server_default=func.now())

    linii = relationship("ComandaLinie", back_populates="comanda", cascade="all, delete-orphan")


class ComandaLinie(Base):
    """Order line detail fetched via Rfc/Next (GetOrderRfc)."""
    __tablename__ = "comenzi_linii"

    id                = Column(Integer, primary_key=True)
    comanda_id        = Column(Integer, ForeignKey("comenzi.id", ondelete="CASCADE"), nullable=False, index=True)
    erp_order_id      = Column(String(64), nullable=False, index=True)
    line_index        = Column(Integer)
    product_name      = Column(Text)
    product_group     = Column(String(200))
    quantity          = Column(Numeric(10, 3))
    unit_of_measure   = Column(String(20))
    unit_price        = Column(Numeric(10, 2))
    discount_percent  = Column(Numeric(5, 2))
    total             = Column(Numeric(10, 2))
    tax_percent       = Column(Numeric(5, 2))
    tax_text          = Column(String(50))
    order_line_status = Column(Integer)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    comanda = relationship("Comanda", back_populates="linii")
    created_at       = Column(DateTime(timezone=True), server_default=func.now())


class ComandaStatusHistory(Base):
    __tablename__ = "comenzi_status_history"
    id          = Column(Integer, primary_key=True)
    erp_id      = Column(String(64), nullable=False, index=True)
    number      = Column(Integer)
    status      = Column(Integer, nullable=False)
    is_ridicare = Column(Boolean, default=False)
    erp_time    = Column(DateTime(timezone=True))
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
