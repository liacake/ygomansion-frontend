# Ghost Mansion – Plain HTML/CSS/JS Frontend

## ⚠️ IMPORTANT: Backend CORS Configuration

The Spring Boot backend currently only allows `http://localhost:4200` (the Angular dev server).
Before running this frontend, **update the CORS origins** in all controllers OR add a global CORS config:

### Option A – Edit each controller (quick fix)
In each `@CrossOrigin(origins = "http://localhost:4200")` annotation, change to your serving origin, e.g.:
```java
@CrossOrigin(origins = {"http://localhost:4200", "http://localhost:5500", "http://127.0.0.1:5500"})
```

### Option B – Global CORS config (recommended)
Add a `CorsConfig.java` in the security package:
```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins("http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:4200")
            .allowedMethods("GET","POST","PUT","DELETE","OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true);
    }
}
```

## Running the Frontend

1. **Fix CORS** in the backend (see above)
2. **Start the backend**: `./mvnw spring-boot:run` (requires PostgreSQL running with `ghostmansion` DB)
3. **Serve the frontend** with any static file server, e.g.:
   - VS Code Live Server (right-click `index.html` → Open with Live Server) → runs on `http://127.0.0.1:5500`
   - Python: `python -m http.server 5500` (from the `ghostmansion/` folder)
   - Node.js: `npx serve .`

## File Structure

```
ghostmansion/
├── index.html          — Home / landing page
├── login.html          — Login
├── register.html       — Registration
├── cards.html          — Card browser (local + YGOPRODeck API)
├── card-detail.html    — Card detail / edit / delete
├── card-new.html       — Create a new custom card
├── decks.html          — Deck library
├── deck-editor.html    — Deck builder / editor
├── deck-new.html       — Create a new deck
├── profile.html        — User profile (view + edit)
├── css/
│   └── main.css        — All styles
└── js/
    └── app.js          — Shared utilities, Auth, API helpers, render helpers
```

## Features

| Feature | Implementation |
|---|---|
| JWT Authentication | Login / Register → JWT stored in localStorage |
| External API | YGOPRODeck API (`https://db.ygoprodeck.com/api/v7/`) |
| Local Cards CRUD | Full create / read / update / delete with auth guards |
| Deck Builder | Search + add ygopro & custom cards, YDK import, save |
| User Profiles | View cards & decks, edit description & avatar |
| Responsive | Mobile-first CSS with flexbox/grid |
| Form Validation | Client-side validation on all forms |
| Auth Guards | Pages require login where needed |

## API Endpoints Used

| Method | Endpoint | Auth |
|---|---|---|
| POST | `/api/auth/login` | — |
| POST | `/api/auth/register` | — |
| GET | `/api/cards` | — |
| GET | `/api/cards/{id}` | — |
| POST | `/api/cards` | ✅ |
| PUT | `/api/cards/{id}` | ✅ owner/admin |
| DELETE | `/api/cards/{id}` | ✅ owner/admin |
| GET | `/api/decks` | — |
| GET | `/api/decks/{id}` | — |
| POST | `/api/decks` | ✅ |
| PUT | `/api/decks/{id}` | ✅ owner/admin |
| DELETE | `/api/decks/{id}` | ✅ owner/admin |
| GET | `/api/users/{id}` | — |
| PUT | `/api/users/{id}` | ✅ owner/admin |
