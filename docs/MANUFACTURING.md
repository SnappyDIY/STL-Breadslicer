# Fertigung in STL BreadSlicer 0.5

## Muster und Wandabstand

Massiv ist der Standard. Honeycomb und Gitter erzeugen regelmäßige Öffnungen. Voronoi verwendet eine deterministische Zellaufteilung durch Abstands-Halbebenen; Gyroid ist ein dreidimensionales implizites Feld aus Sinus-/Kosinusfunktionen. Die bestehende Dichte-Einstellung steuert den Öffnungsgrad, wie im Interface angegeben. Zellgröße und Wandstärke werden in Millimetern angewendet.

Der räumliche Wandabstand berücksichtigt den gesamten Quellkörper einschließlich Rundungen und vorhandener Öffnungen. Ein beschleunigtes Dreiecks-Abstandsfeld erzeugt den Innenbereich; nur dort dürfen Muster Material entfernen. Die Fertigungsauflösung unter Erweiterte Optionen begrenzt die numerische Schrittweite (Standard 0,5 mm, bei dünnen Wänden automatisch feiner). Eine zusätzliche halbe Schrittweite dient als konservativer Abstandszuschlag; die tatsächliche Wand kann auflösungsbedingt abweichen. Das ist eine aufgelöste räumliche Berechnung, keine mathematisch exakte kontinuierliche Offsetfläche. Sehr große/feine Felder werden mit einer verständlichen Meldung begrenzt.

## Oberflächen / Relief

Für 3D-Druck stehen Rillen, Punkte und Kreuzraster zur Verfügung. Das Muster wird in die obere Schnittfläche eingraviert, ohne die nominalen Außenmaße zu vergrößern. Tiefe und Abstand sind einstellbar. Die Tiefe darf höchstens 45 % der jeweiligen Scheibendicke betragen. Der Konturrand bleibt geschützt. Im Lasermodus werden diese räumlichen Gravuren nicht angewendet.

## Verbindungen

Zwei Verbindungen pro unmittelbar benachbarter Trennfläche werden automatisch in vorhandenem Material gesucht. Positionen und Pocket-Tiefen werden mit echten 3D-Schnittvolumina geprüft.

- Passbohrungen: passende Blindbohrungen auf beiden Seiten und separate Passstifte. Die losen Stifte werden im STL-ZIP und im 3MF mit exportiert.
- Steckzapfen: Zapfen am unteren Teil und Buchsen am darüberliegenden Teil. Zapfen stehen über die nominale Scheibendicke hinaus.

Durchmesser, Einstecktiefe und Passungsspiel sind einstellbar. Die tatsächliche Einstecktiefe wird auf 40 % der dünneren Scheibe begrenzt. Das Passungsspiel ist ein Durchmesserspiel. Wenn keine zwei sicheren Stellen existieren, wird die Berechnung mit einer klaren Meldung beendet; Durchmesser/Tiefe oder Modellmaß können dann angepasst werden. Verbindungen werden im Lasermodus nicht angewendet.

## Laser, Kerf und Platten

Die Laserlinie einer Scheibe liegt ausschließlich in ihrer Mitte. Die Silhouette projiziert dagegen das vollständige Modell. Der Silhouettenabstand verändert die Sollkontur; Kerf korrigiert anschließend den Werkzeugweg.

SVG, DXF und Vorschau verwenden denselben Clipper2-Offset für sämtliche Außen- und Innenkonturen. Dabei werden Überschneidungen aufgelöst und zu kleine Öffnungen gegebenenfalls geschlossen. Positive Kerf-Werte erweitern Außenkonturen um die halbe Schnittbreite und verkleinern Innenöffnungen entsprechend.

Plattenlayout SVG/DXF ordnet echte Konturen mit 0/90/180/270 Grad Drehung und Abstand an. Hohlräume werden für die Platzierung reserviert. Konturkollisionen werden geometrisch geprüft; zusätzliche Platten entstehen automatisch. Das ZIP enthält pro Platte SVG und DXF sowie anordnung.json mit Scheibennummer, Position und Drehung. Kerf ist bereits enthalten und darf beim Import in andere Software nicht nochmals angewendet werden.

Die Anordnung ist heuristisch und garantiert keine global optimale Belegung. Physische Kerf- und Passungswerte müssen zur verwendeten Maschine und zum Material passen.