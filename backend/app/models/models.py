from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, Text, ForeignKey, Date
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
    data = Column(Date, unique=True, nullable=False)
    total_conversatii = Column(Integer, default=0)
    conversations = Column(JSONB, default=[])
    top_recomandari = Column(JSONB, default=[])
    top_lucruri_bune = Column(JSONB, default=[])
    created_at = Column(DateTime, server_default=func.now())
