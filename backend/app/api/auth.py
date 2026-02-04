from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime

from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    require_admin
)
from app.models import User
from app.schemas import LoginRequest, TokenResponse, UserResponse, UserCreate, UserUpdate

router = APIRouter(prefix="/auth", tags=["🔐 Autentificare"])


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Autentificare cu cod acces (PIN/card)
    """
    # Find user by cod_acces (hashed)
    result = await db.execute(
        select(User).where(User.activ == True)
    )
    users = result.scalars().all()
    
    user = None
    for u in users:
        if verify_password(request.cod_acces, u.cod_acces):
            user = u
            break
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cod acces invalid"
        )
    
    # Update last login
    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(ultima_autentificare=datetime.utcnow())
    )
    await db.commit()
    
    # Create token
    access_token = create_access_token(data={"sub": user.id})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    Obține informații despre utilizatorul curent
    """
    return UserResponse.model_validate(current_user)


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Lista utilizatori (doar admin)
    """
    result = await db.execute(
        select(User).order_by(User.nume_complet)
    )
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Creează utilizator nou (doar admin)
    """
    # Check if username exists
    result = await db.execute(
        select(User).where(User.username == user_data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username-ul există deja"
        )
    
    # Create user
    user = User(
        username=user_data.username,
        nume_complet=user_data.nume_complet,
        cod_acces=get_password_hash(user_data.cod_acces),
        rol=user_data.rol
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    return UserResponse.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Actualizează utilizator (doar admin)
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilizator negăsit")
    
    update_data = user_data.model_dump(exclude_unset=True)
    
    # Hash new password if provided
    if "cod_acces" in update_data:
        update_data["cod_acces"] = get_password_hash(update_data["cod_acces"])
    
    for field, value in update_data.items():
        setattr(user, field, value)
    
    await db.commit()
    await db.refresh(user)
    
    return UserResponse.model_validate(user)
