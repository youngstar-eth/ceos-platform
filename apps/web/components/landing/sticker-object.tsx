'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

export function StickerObject(props: any) {
    const meshRef = useRef<THREE.Mesh>(null);

    // Load the sticker bomb texture
    const texture = useTexture('/sticker-bomb.png');

    // Configure texture for wrapping
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2); // Repeat to make stickers smaller/denser
    texture.colorSpace = THREE.SRGBColorSpace;

    // Animate the object
    useFrame((state, delta) => {
        if (meshRef.current) {
            // Slow rotation
            meshRef.current.rotation.x += delta * 0.1;
            meshRef.current.rotation.y += delta * 0.15;

            // Floating motion
            meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
        }
    });

    return (
        <group {...props}>
            <mesh ref={meshRef} castShadow receiveShadow>
                {/* Complex geometry to show off the texture mapping */}
                <torusKnotGeometry args={[1, 0.35, 128, 32]} />
                <meshPhysicalMaterial
                    map={texture}
                    roughness={0.2}
                    metalness={0.1}
                    clearcoat={1.0}        // Vinyl gloss
                    clearcoatRoughness={0.1}
                    bumpMap={texture}      // Subtle bump based on the stickers
                    bumpScale={0.02}
                />
            </mesh>
        </group>
    );
}
