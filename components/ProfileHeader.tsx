import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

interface ProfileHeaderProps {
    displayName?: string | null;
    onAvatarPress?: () => void;
}

export default function ProfileHeader({ displayName, onAvatarPress }: ProfileHeaderProps) {
    const loaded = displayName !== null && displayName !== undefined;
    const name = displayName || 'Aero User';
    const initials = name.substring(0, 2).toUpperCase();

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#4F46E5', '#818CF8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
            />
            <View style={styles.content}>
                <Pressable
                    onPress={onAvatarPress}
                    style={styles.avatarContainer}
                    accessibilityRole="button"
                    accessibilityLabel="Edit profile"
                >
                    <Text style={styles.avatarText}>{initials}</Text>
                </Pressable>
                <View style={styles.infoContainer}>
                    <Text style={styles.brandText}>Aero Agent</Text>
                    <Text style={styles.welcomeText}>Welcome back,</Text>
                    <Text style={[styles.nameText, !loaded && { opacity: 0 }]} numberOfLines={1}>
                        {name}
                    </Text>
                </View>
            </View>
            <View style={styles.decorativeCircle1} />
            <View style={styles.decorativeCircle2} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        height: '33.33%',
        backgroundColor: '#4F46E5',
        overflow: 'hidden',
        justifyContent: 'flex-end',
        paddingHorizontal: 24,
        paddingBottom: 20,
        position: 'relative',
    },
    gradient: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        zIndex: 10,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            web: {
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            },
            default: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.2,
                shadowRadius: 16,
                elevation: 10,
            },
        }),
    },
    avatarText: {
        fontSize: 28,
        fontWeight: '800',
        color: '#fff',
    },
    infoContainer: {
        marginLeft: 20,
        flex: 1,
    },
    brandText: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
        fontWeight: '600',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    welcomeText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
        fontWeight: '600',
        marginBottom: 2,
    },
    nameText: {
        fontSize: 24,
        color: '#fff',
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    decorativeCircle1: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        top: -50,
        right: -50,
    },
    decorativeCircle2: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        bottom: -30,
        left: '20%',
    },
});
