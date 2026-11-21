"""Persistence and request contracts for research agents."""

import time
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import JSON, Column, Float, ForeignKey, Integer, String, Text

from ..db import Base, uid


class AgentDefinition(Base):
    __tablename__ = 'agent_definitions'
    id = Column(String, primary_key=True, default=uid)
    workspace_id = Column(
        String, ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True
    )
    owner_id = Column(String, nullable=False)
    name = Column(String(100), nullable=False)
    instructions = Column(Text, nullable=False)
    output_format = Column(String(32), nullable=False, default='detailed_notes')
    source_config = Column(JSON, nullable=False, default=dict)
    created = Column(Float, default=time.time)


class AgentRun(Base):
    __tablename__ = 'agent_runs'
    id = Column(String, primary_key=True, default=uid)
    workspace_id = Column(
        String, ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True
    )
    agent_id = Column(String, nullable=False, index=True)
    actor_id = Column(String, nullable=False)
    question = Column(Text, nullable=False)
    status = Column(String, nullable=False, default='queued', index=True)
    lease = Column(Float, default=0)
    generation = Column(Integer, default=0)
    attempts = Column(Integer, default=0)
    error = Column(Text)
    steps = Column(JSON, nullable=False, default=list)
    result = Column(JSON)
    created = Column(Float, default=time.time)


class CreateAgent(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    instructions: str = Field(default='Find relevant evidence and cite sources.', max_length=2000)
    output_format: Literal['detailed_notes', 'concise', 'report'] = 'detailed_notes'
    include_documents: bool = True
    document_ids: list[str] = Field(default_factory=list, max_length=200)
    include_gmail: bool = False
    providers: list[str] = Field(default_factory=list, max_length=12)


class ResearchRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
