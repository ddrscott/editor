# Java Runner Setup

The Java execution feature requires `tools.jar` (the Java compiler) to be served from the same origin.

## Current Configuration

The project serves tools.jar from `/tools.jar`. The file lives in `public/tools.jar` and is automatically copied to `dist/` on build.

## Updating tools.jar

If you need to update tools.jar:

```bash
# Download from JavaFiddle (reliable source, ~17MB)
curl -o public/tools.jar https://javafiddle.leaningtech.com/tools.jar
```

## Alternative Sources

If needed, tools.jar can also be obtained from:
- JavaFiddle CDN: `https://javafiddle.leaningtech.com/tools.jar`
- Any JDK 8 installation: `$JAVA_HOME/lib/tools.jar`

## File Size

- `tools.jar`: ~17MB
- First-time users will download this file once (browser caches it)
- CheerpJ runtime: ~15MB additional (served from CheerpJ CDN, cached)

Total first-time load: ~32MB (cached after first use)

## Testing

1. Create a new `.java` file in the editor (e.g., `Main.java`)
2. Add a simple Hello World program:
   ```java
   public class Main {
       public static void main(String[] args) {
           System.out.println("Hello from Java!");
       }
   }
   ```
3. Press `Cmd+R` or click the Run button
4. First run will take 5-10 seconds (loading CheerpJ + tools.jar)
5. Subsequent runs should take 1-2 seconds
