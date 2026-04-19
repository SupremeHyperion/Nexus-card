import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { createServer } from "http";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

(async () => {
  try {
    // Registriamo le rotte
    const server = registerRoutes(app);

    // Gestione errori
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      res.status(status).json({ message: err.message || "Internal Server Error" });
    });

    // FORZIAMO LA PORTA 3000
    // Usiamo process.env.PORT perché Replit la imposta automaticamente a 3000
    const PORT = Number(process.env.PORT) || 3000;

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ SERVER ONLINE SULLA PORTA ${PORT}`);
      console.log(`🚀 Database sincronizzato!`);
    });
  } catch (error) {
    console.error("❌ ERRORE CRITICO ALL'AVVIO:", error);
  }
})();
