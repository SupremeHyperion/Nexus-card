import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export function registerRoutes(app: Express): Server {
  // API per ottenere tutte le carte
  app.get("/api/cards", async (_req, res) => {
    try {
      const cards = await storage.getCards();
      res.json(cards);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero delle carte" });
    }
  });

  // API per ottenere una singola carta tramite ID
  app.get("/api/cards/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const card = await storage.getCard(id);
      if (!card) {
        return res.status(404).json({ message: "Carta non trovata" });
      }
      res.json(card);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero della carta" });
    }
  });

  // Creazione del server HTTP
  const httpServer = createServer(app);
  return httpServer;
}
