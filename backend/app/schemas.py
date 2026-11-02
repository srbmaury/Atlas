"""Request schemas shared by Atlas API route groups."""

from typing import List

from pydantic import BaseModel, Field


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=200)


class Named(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class Turn(BaseModel):
    role: str = Field(pattern='^(user|assistant)$')
    content: str = Field(max_length=6000)


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    document_ids: List[str] = Field(default_factory=list, max_length=200)
    history: List[Turn] = Field(default_factory=list, max_length=12)


class UploadRequest(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    size: int = Field(gt=0)


class DeleteWorkspaceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ConversationPayload(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    messages: list[dict] = Field(default_factory=list, max_length=300)


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class ConnectedQuestion(Question):
    include_documents: bool = True
    include_gmail: bool = False
    gmail_query: str = Field(default='newer_than:30d', max_length=400)
    providers: List[str] = Field(default_factory=list, max_length=12)
